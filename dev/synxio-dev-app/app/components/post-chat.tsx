import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { siteNameToIcon, siteNameToTitle, SocialMediaSite } from "./util";
import { useSynxioCallEndpoint, Synxio } from "~/lib/synxio";
import { EndpointRef, GetAppTypeComponent } from "@repo/core";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";
import Markdown from "react-markdown";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "./ui/form";
import { z } from "zod";
import { Textarea } from "./ui/textarea";
import { Spinner } from "./spinner";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Bot, User } from "lucide-react";

function ChatMessageContent({
  site,
  component,
  scrollToBottom,
  onApprove,
}: {
  site: SocialMediaSite;
  component: GetAppTypeComponent<SocialMediaGeneratorApp, "ChatMessage">;
  scrollToBottom: () => void;
  onApprove: ((content: string) => void) | undefined;
}) {
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom, component]);
  return (
    <>
      <div className="border rounded p-4 text-sm grid grid-cols-[32px_1fr] gap-4">
        <div>
          <div className="bg-slate-300 rounded-full size-8 text-slate-900 items-center justify-center flex">
            <User className="size-5" />
          </div>
        </div>
        <Markdown className="prose prose-sm prose-invert">
          {component.state.userMessage}
        </Markdown>
      </div>
      {component.state.assistantMessage ? (
        <div className="border rounded p-4 text-sm grid grid-cols-[32px_1fr] gap-4">
          <div className="bg-slate-300 rounded-full size-8 text-slate-900 items-center justify-center flex">
            <Bot className="size-5" />
          </div>
          <Markdown className="prose prose-sm prose-invert">
            {component.state.assistantMessage}
          </Markdown>
        </div>
      ) : null}
      {component.state.post ? (
        <div className="border rounded text-sm">
          <div className="border-b p-4 flex items-center justify-between">
            <div>{siteNameToIcon[site]}</div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!onApprove}
              onClick={() => {
                const content = component.state.post?.content;
                if (content && onApprove) {
                  onApprove(content);
                }
              }}
            >
              Approve
            </Button>
          </div>
          <div className="p-4">
            <Markdown className="prose prose-sm prose-invert">
              {component.state.post.content}
            </Markdown>
            <hr className="my-4" />
            <Markdown className="prose text-xs text-gray-500 prose-invert max-w-full">
              {component.state.post.reasoning}
            </Markdown>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatMessage({
  id,
  site,
  scrollToBottom,
  onApprove,
}: {
  id: string;
  site: SocialMediaSite;
  scrollToBottom: () => void;
  onApprove: ((content: string) => void) | undefined;
}) {
  return (
    <Synxio.Component
      name="ChatMessage"
      id={id}
      whenRunning={(component) => (
        <>
          <ChatMessageContent
            component={component}
            scrollToBottom={scrollToBottom}
            site={site}
            onApprove={onApprove}
          />
          <Spinner />
        </>
      )}
      whenCompleted={(component) => (
        <ChatMessageContent
          component={component}
          scrollToBottom={scrollToBottom}
          site={site}
          onApprove={onApprove}
        />
      )}
    />
  );
}

const PostFeedbackSchema = z.object({
  content: z.string().min(1),
});

type PostFeedbackSchema = z.infer<typeof PostFeedbackSchema>;

function PostChatForm({
  messageUrl,
}: {
  messageUrl:
    | EndpointRef<{
        readonly content: string;
        readonly kind: "message";
      }>
    | undefined;
}) {
  const callMessageEndpoint = useSynxioCallEndpoint(messageUrl);

  const form = useForm<PostFeedbackSchema>({
    resolver: zodResolver(PostFeedbackSchema),
  });

  const onSubmit = (data: PostFeedbackSchema) => {
    callMessageEndpoint?.({ kind: "message", content: data.content });
  };

  return (
    <div className="max-w-2xl w-full relative">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={`flex flex-row items-center ${callMessageEndpoint ? "" : "opacity-50"}`}
        >
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Make it better"
                    className="w-full text-xs pr-[100px]"
                    style={{
                      // @ts-expect-error fieldSizing is not yet supported everywhere
                      fieldSizing: "content",
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          ></FormField>
          <div className="flex justify-end gap-4 absolute right-[0.75rem] bottom-[0.75rem]">
            <Button type="submit" disabled={!callMessageEndpoint}>
              Post
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function PostChatContent({
  component,
  site,
}: {
  component: GetAppTypeComponent<SocialMediaGeneratorApp, "Post">;
  site: SocialMediaSite;
}) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) {
      return;
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, [chatContainerRef]);
  const callApprovalEndpoint = useSynxioCallEndpoint(
    component.endpoints.approval
  );
  const onApprove = useMemo(() => {
    if (!callApprovalEndpoint) {
      return undefined;
    }
    return (content: string) => {
      callApprovalEndpoint({ kind: "approval", content });
    };
  }, [callApprovalEndpoint]);
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Iterate
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-[90vw] min-h-[90vh] w-[90vw] h-[90vh] grid-rows-[auto_1fr_auto] p-0 gap-0">
        <DialogHeader className="p-4">
          <DialogTitle>{siteNameToTitle[site]} Post</DialogTitle>
          <DialogDescription>
            Iterate on your post to improve it.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex-grow border-t border-b p-8 overflow-auto "
          ref={chatContainerRef}
        >
          <div className="mx-auto max-w-2xl space-y-8">
            {component.components.ChatMessages?.map((id) => (
              <ChatMessage
                id={id}
                key={id}
                site={site}
                onApprove={onApprove}
                scrollToBottom={scrollToBottom}
              />
            ))}
          </div>
        </div>
        <DialogFooter className="p-4 justify-center sm:justify-center items-center">
          <PostChatForm
            messageUrl={component.endpoints.message}
            key={component.components.ChatMessages?.length ?? 0}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PostChat({ id, site }: { id: string; site: SocialMediaSite }) {
  return (
    <Synxio.Component
      name="Post"
      id={id}
      whenRunning={(component) => (
        <PostChatContent component={component} site={site} />
      )}
    />
  );
}
