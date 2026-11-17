import * as React from 'react';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ChatOnFinishCallback, UIMessage } from 'ai';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { MAX_USER_MESSAGE_CHARS } from '@ai-ledger/schema/chat';

import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Message, MessageContent, MessageFooter } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import {
  createChatTransport,
  describeChatError,
  type ChatTransportOptions,
} from '@/lib/chat-transport';

/** How a reply ended, when it didn't end normally. Keyed by message id. */
type ReplyNote = 'stopped' | 'incomplete' | 'length';

const REPLY_NOTES: Record<ReplyNote, string> = {
  stopped: 'Stopped',
  incomplete: 'Response incomplete',
  length: 'Response cut off at the length limit',
};

const INTERRUPTED_MESSAGE = 'The response was interrupted before it finished. Please try again.';

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

export type ChatProps = ChatTransportOptions;

export function Chat(transportOptions: ChatProps) {
  // The transport is read once by useChat; keep it stable across renders.
  const [transport] = useState(() => createChatTransport(transportOptions));
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<Record<string, ReplyNote>>({});
  // The stream ended without a `finish` chunk (e.g. a proxy closed it cleanly).
  const [interrupted, setInterrupted] = useState(false);

  const onFinish: ChatOnFinishCallback<UIMessage> = ({
    message,
    messages,
    isAbort,
    isError,
    finishReason,
  }) => {
    // The reply is only in the list if at least one chunk arrived.
    const hasReply = message.role === 'assistant' && messages.at(-1)?.id === message.id;
    let note: ReplyNote | undefined;
    if (isAbort) {
      note = 'stopped';
    } else if (isError) {
      note = 'incomplete';
    } else if (finishReason === undefined) {
      setInterrupted(true);
      note = 'incomplete';
    } else if (finishReason === 'length') {
      note = 'length';
    }
    if (note && hasReply) setNotes((prev) => ({ ...prev, [message.id]: note }));
  };

  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    transport,
    onFinish,
    onError: (err) => console.error('Chat error:', err),
  });

  const busy = status === 'submitted' || status === 'streaming';
  const canSend = !busy && draft.trim().length > 0;
  const problem = error ? describeChatError(error) : interrupted ? INTERRUPTED_MESSAGE : undefined;
  const lastMessage = messages.at(-1);
  const waitingForText =
    busy && !(lastMessage?.role === 'assistant' && textOf(lastMessage).length > 0);

  function send(text: string, messageId?: string) {
    setInterrupted(false);
    void sendMessage({ text, messageId });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    send(draft.trim());
    setDraft('');
  }

  function retry() {
    const lastUser = messages.findLast((message) => message.role === 'user');
    if (!lastUser) return;
    // Replacing the user message drops the failed reply after it.
    send(textOf(lastUser), lastUser.id);
  }

  function dismiss() {
    clearError();
    setInterrupted(false);
  }

  return (
    <MessageScrollerProvider>
      <div className="flex h-dvh w-full md:w-2xl mx-auto flex-col">
        <div className="min-h-0 flex-1">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-6 px-8 py-8">
                {messages.length === 0 && (
                  <p className="text-muted-foreground text-center">
                    Ask a question about your expenses to get started.
                  </p>
                )}
                {messages.map((message) => {
                  const text = textOf(message);
                  const note = notes[message.id];
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === 'user'}
                    >
                      {message.role === 'user' ? (
                        <Message align="end">
                          <MessageContent>
                            <Bubble align="end" variant="muted">
                              <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      ) : (
                        <Message>
                          <MessageContent className="whitespace-pre-wrap">{text}</MessageContent>
                          {note && (
                            <MessageFooter className="text-muted-foreground text-xs">
                              {REPLY_NOTES[note]}
                            </MessageFooter>
                          )}
                        </Message>
                      )}
                    </MessageScrollerItem>
                  );
                })}
                {waitingForText && (
                  <p role="status" className="text-muted-foreground text-sm animate-pulse">
                    Thinking…
                  </p>
                )}
                {problem && (
                  <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p role="alert" className="text-destructive">
                      {problem}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={retry}>
                        Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={dismiss}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </div>
        <div className="p-8 pt-0">
          <form onSubmit={onSubmit}>
            <InputGroup>
              <InputGroupTextarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about your expenses..."
                maxLength={MAX_USER_MESSAGE_CHARS}
                aria-label="Message"
                className="min-h-14"
                onKeyDown={(event) => {
                  // keyCode 229 to handle Safari
                  const isComposing = event.nativeEvent.isComposing || event.keyCode === 229;
                  if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <InputGroupAddon align="block-end">
                {busy ? (
                  <InputGroupButton
                    type="button"
                    variant="default"
                    size="icon-sm"
                    onClick={() => void stop()}
                    className="ml-auto"
                  >
                    <SquareIcon className="fill-current" />
                    <span className="sr-only">Stop</span>
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={!canSend}
                    className="ml-auto"
                  >
                    <ArrowUpIcon />
                    <span className="sr-only">Send</span>
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </MessageScrollerProvider>
  );
}
