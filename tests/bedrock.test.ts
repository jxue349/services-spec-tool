import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Bedrock provider with the AWS SDK mocked.
 *
 * The failures worth covering are the first-run ones: a model id that is not
 * available in the region, access not granted, and a throttle. Those are what
 * someone hits before anything works, and a vague error there costs an hour.
 */

const { send, ConverseCommandMock } = vi.hoisted(() => ({
  send: vi.fn(),
  ConverseCommandMock: vi.fn((input: unknown) => ({ input })),
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = send;
  },
  ConverseCommand: ConverseCommandMock,
}));

import { __resetBedrockClient, bedrockProvider, textFromConverse } from '@/lib/providers/bedrock';
import { compile } from '@/lib/compiler';
import { z } from 'zod';

const reply = (text: string) => ({ output: { message: { role: 'assistant', content: [{ text }] } } });

function awsError(name: string, httpStatusCode = 400) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetBedrockClient();
  process.env.COMPILER_PROVIDER = 'bedrock';
  process.env.BEDROCK_MODEL_ID = 'openai.gpt-5.6-luna';
  process.env.AWS_REGION = 'us-west-2';
  delete process.env.BEDROCK_TEMPERATURE;
});

afterEach(() => {
  delete process.env.COMPILER_PROVIDER;
  delete process.env.BEDROCK_MODEL_ID;
  delete process.env.AWS_REGION;
});

describe('textFromConverse', () => {
  it('concatenates text blocks', () => {
    expect(textFromConverse(reply('{"a":')).concat()).toBe('{"a":');
    expect(
      textFromConverse({ output: { message: { content: [{ text: '{"a":' }, { text: '1}' }] } } }),
    ).toBe('{"a":1}');
  });

  it('ignores non-text blocks', () => {
    const out = { output: { message: { content: [{ toolUse: { name: 'x' } }, { text: 'hello' }] } } };
    expect(textFromConverse(out)).toBe('hello');
  });

  it('throws when there is no text at all', () => {
    expect(() => textFromConverse({ output: { message: { content: [] } } })).toThrow(/no text content/);
  });
});

describe('bedrockProvider.complete', () => {
  it('sends a Converse request carrying the system and user prompts', async () => {
    send.mockResolvedValueOnce(reply('answer'));

    await expect(bedrockProvider.complete('SYSTEM', 'USER')).resolves.toBe('answer');

    const input = ConverseCommandMock.mock.calls[0]?.[0] as {
      modelId: string;
      system: Array<{ text: string }>;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
      inferenceConfig: { maxTokens: number; temperature: number };
    };

    expect(input.modelId).toBe('openai.gpt-5.6-luna');
    expect(input.system[0]?.text).toBe('SYSTEM');
    expect(input.messages[0]).toMatchObject({ role: 'user' });
    expect(input.messages[0]?.content[0]?.text).toBe('USER');
    // Compiling a spec wants the same answer twice.
    expect(input.inferenceConfig.temperature).toBe(0);
    expect(input.inferenceConfig.maxTokens).toBe(2_000);
  });

  it('honours BEDROCK_TEMPERATURE', async () => {
    process.env.BEDROCK_TEMPERATURE = '0.4';
    send.mockResolvedValueOnce(reply('x'));

    await bedrockProvider.complete('S', 'U');
    const input = ConverseCommandMock.mock.calls[0]?.[0] as { inferenceConfig: { temperature: number } };
    expect(input.inferenceConfig.temperature).toBe(0.4);
  });

  it('names the model and region when the model id is rejected', async () => {
    send.mockRejectedValue(awsError('ValidationException'));

    await expect(bedrockProvider.complete('S', 'U')).rejects.toThrow(
      /rejected model "openai\.gpt-5\.6-luna" in us-west-2/,
    );
    // Terminal: a wrong model id will not come right on a retry.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('explains an access denial rather than retrying it', async () => {
    send.mockRejectedValue(awsError('AccessDeniedException', 403));

    await expect(bedrockProvider.complete('S', 'U')).rejects.toThrow(/denied access.*Check the IAM policy/s);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries once on a throttle', async () => {
    send.mockRejectedValueOnce(awsError('ThrottlingException', 429)).mockResolvedValueOnce(reply('ok'));

    await expect(bedrockProvider.complete('S', 'U')).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second failure', async () => {
    send.mockRejectedValue(awsError('InternalServerException', 500));

    await expect(bedrockProvider.complete('S', 'U')).rejects.toThrow(/Bedrock request failed/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never echoes the prompt in an error', async () => {
    // Bedrock errors can quote the request, and the request holds the spec.
    send.mockRejectedValue(
      Object.assign(new Error('Malformed input: SECRET-SPEC-TEXT'), {
        name: 'SomeException',
        $metadata: { httpStatusCode: 400 },
      }),
    );

    await expect(bedrockProvider.complete('S', 'SECRET-SPEC-TEXT')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('SECRET-SPEC-TEXT') }) as Error,
    );
  });
});

describe('compile() through Bedrock', () => {
  const schema = z.object({ answer: z.string() });

  it('parses a fenced reply', async () => {
    send.mockResolvedValueOnce(reply('Sure:\n```json\n{"answer":"yes"}\n```'));
    await expect(compile('prompt', schema)).resolves.toEqual({ answer: 'yes' });
  });

  it('retries once with the validation error appended', async () => {
    send.mockResolvedValueOnce(reply('{"wrong":true}')).mockResolvedValueOnce(reply('{"answer":"fixed"}'));

    await expect(compile('prompt', schema)).resolves.toEqual({ answer: 'fixed' });

    const second = ConverseCommandMock.mock.calls[1]?.[0] as {
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    expect(second.messages[0]?.content[0]?.text).toContain('Your previous response could not be used');
  });

  it('carries the no-invented-rules contract in the system prompt', async () => {
    send.mockResolvedValueOnce(reply('{"answer":"ok"}'));
    await compile('prompt', schema);

    const input = ConverseCommandMock.mock.calls[0]?.[0] as { system: Array<{ text: string }> };
    expect(input.system[0]?.text).toContain('Never invent a rule');
    expect(input.system[0]?.text).toContain('Do not use any other company document');
  });

  it('rejects an unknown COMPILER_PROVIDER', async () => {
    process.env.COMPILER_PROVIDER = 'wishful';
    await expect(compile('prompt', schema)).rejects.toThrow(/COMPILER_PROVIDER must be one of/);
  });
});
