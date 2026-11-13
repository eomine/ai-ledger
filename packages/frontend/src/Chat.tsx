import * as React from 'react';
import { useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { MAX_USER_MESSAGE_CHARS } from '@ai-ledger/schema/chat';

import { Bubble, BubbleContent } from '@/components/ui/bubble';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Message, MessageContent } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const initialMessages: ChatMessage[] = [
  { id: '1', role: 'user', text: 'How much did I spend on groceries last month?' },
  {
    id: '2',
    role: 'assistant',
    text: 'You spent $412.37 on groceries in October, across 9 transactions.',
  },
  { id: '3', role: 'user', text: 'And how does that compare to September?' },
  {
    id: '4',
    role: 'assistant',
    text: 'That is about 8% less than September, when you spent $448.90.',
  },
];

export function ChatDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: draft.trim() }]);
    setDraft('');
  }

  return (
    <MessageScrollerProvider>
      <div className="flex h-dvh w-full md:w-2xl mx-auto flex-col">
        <div className="min-h-0 flex-1">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-6 px-8 py-8">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === 'user'}
                  >
                    {message.role === 'user' ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble align="end" variant="muted">
                            <BubbleContent>{message.text}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message>
                        <MessageContent>{message.text}</MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}
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
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </MessageScrollerProvider>
  );
}
