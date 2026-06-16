import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'hedwig',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export const inngestEnabled = !!process.env.INNGEST_EVENT_KEY && !!process.env.INNGEST_SIGNING_KEY;

