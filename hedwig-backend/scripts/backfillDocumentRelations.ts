import 'dotenv/config';
import { supabase } from '../src/lib/supabase';
import { ClientService } from '../src/services/clientService';

type BackfillDocument = {
  id: string;
  user_id: string;
  client_id: string | null;
  project_id: string | null;
  type: string;
  title: string | null;
  description: string | null;
  content: Record<string, any> | null;
};

type ProjectRecord = {
  id: string;
  user_id: string;
  client_id: string | null;
  name: string | null;
  description: string | null;
};

function getContent(document: BackfillDocument) {
  return document.content && typeof document.content === 'object' ? document.content : {};
}

function lower(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

async function resolveProjectLink(document: BackfillDocument, projects: ProjectRecord[]) {
  if (document.project_id) return document.project_id;

  const content = getContent(document);
  const explicitProjectId = content.project_id;
  if (explicitProjectId) return String(explicitProjectId);

  const title = lower(document.title);
  const description = lower(document.description);

  const candidateProjects = projects.filter((project) => {
    if (document.client_id && project.client_id && String(project.client_id) !== String(document.client_id)) {
      return false;
    }
    return true;
  });

  const exactTitleMatch = candidateProjects.find((project) => {
    const projectName = lower(project.name);
    return projectName && (title.includes(projectName) || description.includes(projectName));
  });

  return exactTitleMatch?.id || null;
}

async function main() {
  const { data: documents, error: documentsError } = await supabase
    .from('documents')
    .select('id, user_id, client_id, project_id, type, title, description, content')
    .in('type', ['INVOICE', 'PAYMENT_LINK', 'CONTRACT']);

  if (documentsError) {
    throw new Error(`Failed to fetch documents: ${documentsError.message}`);
  }

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, user_id, client_id, name, description');

  if (projectsError) {
    throw new Error(`Failed to fetch projects: ${projectsError.message}`);
  }

  const docs = (documents || []) as BackfillDocument[];
  const projectRecords = (projects || []) as ProjectRecord[];

  let updatedCount = 0;

  for (const document of docs) {
    const content = getContent(document);
    let clientId = document.client_id;
    let projectId = document.project_id;

    if (!clientId) {
      const clientName = content.client_name || null;
      const clientEmail = content.recipient_email || content.client_email || null;

      if (clientName || clientEmail) {
        const resolvedClient = await ClientService.getOrCreateClient(
          document.user_id,
          clientName,
          clientEmail,
          { createdFrom: 'document_backfill' }
        );
        clientId = resolvedClient.id;
      }
    }

    if (!projectId) {
      const projectsForUser = projectRecords.filter((project) => project.user_id === document.user_id);
      projectId = await resolveProjectLink(
        { ...document, client_id: clientId },
        projectsForUser
      );
    }

    if (clientId !== document.client_id || projectId !== document.project_id) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          client_id: clientId,
          project_id: projectId
        })
        .eq('id', document.id);

      if (updateError) {
        throw new Error(`Failed to update document ${document.id}: ${updateError.message}`);
      }

      updatedCount += 1;
      console.log(
        `[backfill] updated ${document.type} ${document.id} client_id=${clientId ?? 'null'} project_id=${projectId ?? 'null'}`
      );
    }
  }

  console.log(`[backfill] complete. updated ${updatedCount} documents.`);
}

main().catch((error) => {
  console.error('[backfill] failed:', error);
  process.exit(1);
});
