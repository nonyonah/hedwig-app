import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('FeedbackRoute');
const router = Router();

const USERBACK_BASE_URL = 'https://rest.userback.io/1.0';

type FeedbackKind = 'bug' | 'feature';

const USERBACK_TYPE_MAP: Record<FeedbackKind, 'Bug' | 'Idea'> = {
    bug: 'Bug',
    feature: 'Idea',
};

type ProjectListEntry = { id?: number | string };
type UserbackProjectListResponse =
    | Array<ProjectListEntry>
    | {
        items?: Array<ProjectListEntry>;
        data?: Array<ProjectListEntry>;
        projects?: Array<ProjectListEntry>;
        Projects?: Array<ProjectListEntry>;
    };

let cachedProjectId: number | null = null;

const normalizeProjectId = (value: unknown): number | null => {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return null;
    return Math.trunc(id);
};

const extractFirstProjectId = (payload: UserbackProjectListResponse): number | null => {
    if (Array.isArray(payload)) {
        return normalizeProjectId(payload[0]?.id);
    }

    const candidates = [
        payload?.items,
        payload?.data,
        payload?.projects,
        payload?.Projects,
    ];

    for (const list of candidates) {
        if (Array.isArray(list) && list.length > 0) {
            const id = normalizeProjectId(list[0]?.id);
            if (id) return id;
        }
    }

    return null;
};

const getConfiguredProjectId = (): number | null => {
    const configured = normalizeProjectId(process.env.USERBACK_PROJECT_ID);
    if (configured) return configured;
    if (cachedProjectId) return cachedProjectId;
    return null;
};

async function resolveUserbackProjectId(apiToken: string): Promise<number | null> {
    const configured = getConfiguredProjectId();
    if (configured) return configured;

    const response = await fetch(`${USERBACK_BASE_URL}/project?sort=created,desc`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
    });

    if (!response.ok) {
        logger.error('Failed to auto-resolve Userback project', {
            status: response.status,
        });
        return null;
    }

    const payload = await response.json().catch(() => null) as UserbackProjectListResponse | null;
    if (!payload) return null;

    const resolved = extractFirstProjectId(payload);
    if (resolved) {
        cachedProjectId = resolved;
    }
    return resolved;
}

router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const apiToken = String(process.env.USERBACK_API_TOKEN || '').trim();
        if (!apiToken) {
            res.status(503).json({
                success: false,
                error: { message: 'Feedback service is not configured.' },
            });
            return;
        }

        const rawType = String(req.body?.type || '').trim().toLowerCase();
        const feedbackType = rawType === 'bug' || rawType === 'feature'
            ? rawType
            : null;
        const message = String(req.body?.message || '').trim();
        const pageUrl = String(req.body?.pageUrl || '').trim() || 'hedwig://mobile-app/feedback';

        if (!feedbackType) {
            res.status(400).json({
                success: false,
                error: { message: 'type is required (bug or feature).' },
            });
            return;
        }

        if (!message) {
            res.status(400).json({
                success: false,
                error: { message: 'message is required.' },
            });
            return;
        }

        const user = await getOrCreateUser(req.user!.id);
        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found.' },
            });
            return;
        }

        const email = String(user.email || '').trim();
        const fullName = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim();
        const name = fullName || email || 'Hedwig User';

        if (!email) {
            res.status(422).json({
                success: false,
                error: { message: 'User email is required to submit feedback.' },
            });
            return;
        }

        const projectId = await resolveUserbackProjectId(apiToken);
        if (!projectId) {
            res.status(503).json({
                success: false,
                error: { message: 'Userback project is not configured. Set USERBACK_PROJECT_ID.' },
            });
            return;
        }

        const userbackPayload = {
            projectId,
            email,
            feedbackType: USERBACK_TYPE_MAP[feedbackType],
            title: feedbackType === 'bug' ? 'Bug report from Hedwig app' : 'Feature request from Hedwig app',
            description: message,
            name,
            pageUrl,
            notify: true,
            priority: 'neutral',
            category: feedbackType === 'bug' ? 'Bug' : 'Feature Request',
        };

        const userbackResponse = await fetch(`${USERBACK_BASE_URL}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(userbackPayload),
        });

        const rawBody = await userbackResponse.text();
        let parsed: any = null;
        if (rawBody) {
            try {
                parsed = JSON.parse(rawBody);
            } catch {
                parsed = null;
            }
        }

        if (!userbackResponse.ok) {
            const upstreamMessage = String(
                parsed?.message ||
                parsed?.details?.message ||
                ''
            ).trim();

            logger.error('Userback feedback create failed', {
                status: userbackResponse.status,
                message: upstreamMessage || null,
            });

            const messageForClient =
                userbackResponse.status === 401
                    ? 'Feedback provider rejected authentication.'
                    : upstreamMessage || 'Unable to submit feedback right now.';

            res.status(502).json({
                success: false,
                error: { message: messageForClient },
            });
            return;
        }

        res.status(201).json({
            success: true,
            data: {
                id: parsed?.id || null,
                feedbackType: parsed?.feedbackType || USERBACK_TYPE_MAP[feedbackType],
            },
        });
    } catch (error) {
        logger.error('Unhandled feedback submission error', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error while submitting feedback.' },
        });
    }
});

export default router;
