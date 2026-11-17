import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Chat } from './Chat';
import { FakeChatServer, jsonResponse } from './test/fake-chat-server';

let server: FakeChatServer;

beforeEach(() => {
  server = new FakeChatServer();
  // Errors are logged on purpose; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderChat(idleTimeoutMs?: number) {
  const screen = await render(<Chat fetch={server.fetch} idleTimeoutMs={idleTimeoutMs} />);
  const input = screen.getByRole('textbox', { name: 'Message' });
  const ask = async (text: string) => {
    await userEvent.fill(input, text);
    await userEvent.keyboard('{Enter}');
  };
  return {
    screen,
    input,
    ask,
    sendButton: screen.getByRole('button', { name: 'Send' }),
    stopButton: screen.getByRole('button', { name: 'Stop' }),
    alert: screen.getByRole('alert'),
    retryButton: screen.getByRole('button', { name: 'Retry' }),
  };
}

describe('Chat', () => {
  it('sends the conversation to /chat and streams the reply', async () => {
    const { screen, input, ask } = await renderChat();

    await ask('How much did I spend on groceries?');

    const reply = await server.reply(0);
    expect(reply.request.url).toBe('/chat');
    expect(reply.request.body).toMatchObject({
      trigger: 'submit-message',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'How much did I spend on groceries?' }],
        },
      ],
    });
    await expect.element(input).toHaveValue('');
    await expect.element(screen.getByRole('status')).toHaveTextContent('Thinking…');

    reply.start();
    reply.send({ type: 'text-start', id: 't1' });
    reply.send({ type: 'text-delta', id: 't1', delta: 'You spent ' });
    await expect.element(screen.getByText('You spent')).toBeInTheDocument();
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument();

    reply.send({ type: 'text-delta', id: 't1', delta: '$412.37.' });
    reply.send({ type: 'text-end', id: 't1' });
    reply.finish();

    await expect.element(screen.getByText('You spent $412.37.')).toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('alert').query()).toBeNull();
  });

  it('sends earlier turns with the next message', async () => {
    const { ask, screen } = await renderChat();

    await ask('First question');
    const first = await server.reply(0);
    first.start();
    first.send({ type: 'reasoning-start', id: 'r1' });
    first.send({ type: 'reasoning-delta', id: 'r1', delta: 'Let me think' });
    first.send({ type: 'reasoning-end', id: 'r1' });
    first.text('First answer');
    first.finish();
    await expect.element(screen.getByText('First answer')).toBeInTheDocument();

    await ask('Second question');
    const second = await server.reply(1);
    expect(second.request.body.messages).toMatchObject([
      { role: 'user', parts: [{ type: 'text', text: 'First question' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'First answer' }] },
      { role: 'user', parts: [{ type: 'text', text: 'Second question' }] },
    ]);
    // Reasoning stays out of the request.
    expect(second.request.body.messages[1].parts).toHaveLength(1);
  });

  it('does not send blank messages or messages while a reply is streaming', async () => {
    const { ask, sendButton, input } = await renderChat();

    await userEvent.fill(input, '   ');
    await expect.element(sendButton).toBeDisabled();

    await ask('Question');
    await server.reply(0);
    await ask('Another question');
    await expect.element(input).toHaveValue('Another question');
    expect(server.requests).toHaveLength(1);
  });

  it('stops the reply when Stop is clicked, keeping the partial text', async () => {
    const { ask, screen, stopButton, sendButton } = await renderChat();

    await ask('Tell me everything');
    const reply = await server.reply(0);
    reply.start();
    reply.send({ type: 'text-start', id: 't1' });
    reply.send({ type: 'text-delta', id: 't1', delta: 'Here is a partial' });
    await expect.element(screen.getByText('Here is a partial')).toBeInTheDocument();

    await stopButton.click();

    expect(reply.request.signal.aborted).toBe(true);
    await expect.element(screen.getByText('Stopped')).toBeInTheDocument();
    await expect.element(sendButton).toBeInTheDocument();
    expect(screen.getByText('Here is a partial').query()).not.toBeNull();
    expect(screen.getByRole('alert').query()).toBeNull();
  });

  it('can stop before any reply arrives and send again without an empty assistant turn', async () => {
    const { ask, screen, stopButton } = await renderChat();

    await ask('First');
    const first = await server.reply(0);
    first.start(); // No text yet.
    await stopButton.click();
    expect(first.request.signal.aborted).toBe(true);
    await expect.element(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();

    await ask('Second');
    const second = await server.reply(1);
    expect(second.request.body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'user',
    ]);
  });

  it.each([
    [400, "The server couldn't process this message."],
    [413, 'This conversation is too long to send. Reload the page to start a new one.'],
    [500, 'The server is unavailable right now. Please try again in a moment.'],
  ])('shows a friendly message for HTTP %i without the raw body', async (status, message) => {
    const { ask, alert, screen } = await renderChat();
    server.respondOnce(() => jsonResponse(status, { error: 'Invalid request', issues: ['raw'] }));

    await ask('Question');

    await expect.element(alert).toHaveTextContent(message);
    expect(screen.getByText('Invalid request').query()).toBeNull();
    // The question stays so it can be retried.
    expect(screen.getByText('Question').query()).not.toBeNull();
  });

  it('retries the last message after an error, replacing the failed attempt', async () => {
    const { ask, alert, retryButton, screen } = await renderChat();
    server.respondOnce(() => jsonResponse(500, { error: 'Internal server error' }));

    await ask('Question');
    await expect.element(alert).toBeInTheDocument();

    await retryButton.click();
    const reply = await server.reply(0);
    expect(reply.request.body.messages).toHaveLength(1);
    reply.start();
    reply.text('Answer');
    reply.finish();

    await expect.element(screen.getByText('Answer')).toBeInTheDocument();
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Question').elements()).toHaveLength(1);
  });

  it('dismisses the error', async () => {
    const { ask, alert, screen } = await renderChat();
    server.respondOnce(() => jsonResponse(500, {}));

    await ask('Question');
    await expect.element(alert).toBeInTheDocument();
    await screen.getByRole('button', { name: 'Dismiss' }).click();

    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the error when a new message is sent', async () => {
    const { ask, alert, screen } = await renderChat();
    server.respondOnce(() => jsonResponse(500, {}));

    await ask('Question');
    await expect.element(alert).toBeInTheDocument();

    await ask('Another question');
    await server.reply(0);
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a generic message when the server reports an error mid-stream', async () => {
    const { ask, alert, screen } = await renderChat();

    await ask('Question');
    const reply = await server.reply(0);
    reply.start();
    reply.text('Partial answer');
    reply.fail('Raw upstream failure');

    await expect
      .element(alert)
      .toHaveTextContent('Something went wrong while generating a response. Please try again.');
    expect(screen.getByText('Raw upstream failure').query()).toBeNull();
    await expect.element(screen.getByText('Partial answer')).toBeInTheDocument();
    await expect.element(screen.getByText('Response incomplete')).toBeInTheDocument();
  });

  it('reports a connection dropped mid-stream and can retry', async () => {
    const { ask, alert, retryButton, screen } = await renderChat();

    await ask('Question');
    const reply = await server.reply(0);
    reply.start();
    reply.text('Partial answer');
    await expect.element(screen.getByText('Partial answer')).toBeInTheDocument();
    reply.drop();

    await expect
      .element(alert)
      .toHaveTextContent('Lost connection to the server. Check your connection and try again.');
    await expect.element(screen.getByText('Response incomplete')).toBeInTheDocument();

    await retryButton.click();
    const retried = await server.reply(1);
    // The partial reply is discarded, not sent back.
    expect(retried.request.body.messages).toHaveLength(1);
    await expect.element(screen.getByText('Partial answer')).not.toBeInTheDocument();
    retried.start();
    retried.text('Full answer');
    retried.finish();
    await expect.element(screen.getByText('Full answer')).toBeInTheDocument();
  });

  it('reports a backend that cannot be reached', async () => {
    const { ask, alert } = await renderChat();
    server.respondOnce(() => Promise.reject(new TypeError('Failed to fetch')));

    await ask('Question');

    await expect
      .element(alert)
      .toHaveTextContent('Lost connection to the server. Check your connection and try again.');
  });

  it('reports a stream that ends without finishing', async () => {
    const { ask, alert, retryButton, screen } = await renderChat();

    await ask('Question');
    const reply = await server.reply(0);
    reply.start();
    reply.text('Partial answer');
    reply.close();

    await expect
      .element(alert)
      .toHaveTextContent('The response was interrupted before it finished. Please try again.');
    await expect.element(screen.getByText('Response incomplete')).toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();

    await retryButton.click();
    await server.reply(1);
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  it('gives up on a reply that stalls', async () => {
    const { ask, alert, screen } = await renderChat(200);

    await ask('Question');
    const reply = await server.reply(0);
    reply.start();
    reply.text('Partial answer');

    await expect
      .element(alert)
      .toHaveTextContent('The server stopped responding. Please try again.');
    expect(reply.request.signal.aborted).toBe(true);
    await expect.element(screen.getByText('Response incomplete')).toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('notes a reply cut off at the length limit', async () => {
    const { ask, screen } = await renderChat();

    await ask('Question');
    const reply = await server.reply(0);
    reply.start();
    reply.text('A very long answer');
    reply.finish('length');

    await expect
      .element(screen.getByText('Response cut off at the length limit'))
      .toBeInTheDocument();
    expect(screen.getByRole('alert').query()).toBeNull();
  });
});
