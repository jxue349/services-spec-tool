import { getCompilerEnv } from '../env';
import { COMPILE_TIMEOUT_MS } from './types';
import { GleanError, extractAnswer, gleanHeaders } from './glean';

/**
 * Glean's company knowledge, as a *second opinion* — never as the answer.
 *
 * The spec answer runs with agent=GPT precisely so nothing outside the
 * specification can leak into it. This does the opposite on purpose: it asks
 * Glean's retrieval agent the same question against Confluence, Jira, Slack
 * and the rest, and returns it separately.
 *
 * Why that is worth having: the knowledge base is distilled *from* a
 * Confluence page of record. When the two disagree, either the KB is stale or
 * the source is — and that is exactly the signal a spec owner needs. What it
 * must never do is blur into the spec-derived answer, because then no reader
 * can tell which claims the specification actually backs.
 *
 * So the two never share a call, a prompt, or a panel.
 */

export type CompanyKnowledge = {
  answer: string;
  sources: { title: string; url: string }[];
};

type GleanCitation = { sourceDocument?: { title?: unknown; url?: unknown } };
type GleanMessage = { citations?: unknown };

/** Documents Glean cited, deduplicated by URL. */
export function extractSources(body: unknown): { title: string; url: string }[] {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages)) return [];

  const seen = new Map<string, string>();
  for (const message of messages as GleanMessage[]) {
    const citations = Array.isArray(message?.citations) ? (message.citations as GleanCitation[]) : [];
    for (const citation of citations) {
      const url = citation.sourceDocument?.url;
      const title = citation.sourceDocument?.title;
      if (typeof url === 'string' && url !== '' && !seen.has(url)) {
        seen.set(url, typeof title === 'string' && title !== '' ? title : url);
      }
    }
  }

  return [...seen.entries()].slice(0, 8).map(([url, title]) => ({ title, url }));
}

/**
 * Asks Glean's retrieval agent the question against company content.
 *
 * Returns null rather than throwing: this is supplementary, and a failure
 * here must never take down an answer the specification already gave.
 */
export async function askCompanyKnowledge(question: string): Promise<CompanyKnowledge | null> {
  const env = getCompilerEnv();
  if (!env.companyKnowledge) return null;

  try {
    const res = await fetch(`${env.baseUrl}/rest/api/v1/chat`, {
      method: 'POST',
      headers: await gleanHeaders(env),
      signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
      body: JSON.stringify({
        saveChat: false,
        // DEFAULT, not GPT: this call is *supposed* to retrieve.
        agentConfig: { agent: env.companyKnowledgeAgent, mode: env.mode },
        messages: [
          {
            author: 'USER',
            messageType: 'CONTENT',
            fragments: [
              {
                text: [
                  'Answer from Wyze company documentation only. Be brief — three sentences at most.',
                  'If the documentation does not answer it, say so rather than guessing.',
                  '',
                  question,
                ].join('\n'),
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new GleanError(res.status, `Glean knowledge lookup returned ${res.status}`);

    const body = (await res.json()) as unknown;
    return { answer: extractAnswer(body), sources: extractSources(body) };
  } catch {
    // Supplementary by definition. Log nothing sensitive, surface nothing.
    return null;
  }
}
