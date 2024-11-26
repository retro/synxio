import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useSynxio, Synxio } from "~/lib/synxio";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "~/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

const PostFeedbackSchema = z.object({
  content: z.string().min(1),
});

type PostFeedbackSchema = z.infer<typeof PostFeedbackSchema>;

function PostFeedback({
  messageUrl,
  approvalUrl,
}: {
  messageUrl: string;
  approvalUrl: string;
}) {
  const form = useForm<PostFeedbackSchema>({
    resolver: zodResolver(PostFeedbackSchema),
  });

  const onSubmit = (data: PostFeedbackSchema) => {
    fetch(`http://localhost:3000/${messageUrl}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "message", content: data.content }),
    });
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Feedback</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Make it better" />
                </FormControl>
              </FormItem>
            )}
          ></FormField>
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                fetch(`http://localhost:3000/${approvalUrl}`, {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    kind: "approval",
                  }),
                });
              }}
            >
              Approve
            </Button>
            <Button type="submit">Submit Feedback</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function Post({ id, site }: { id: string; site: string }) {
  return (
    <Synxio.Component
      name="Post"
      id={id}
      whenRunning={(component) => {
        return (
          <div className="border rounded p-4 space-y-2">
            <h2 className="text-md font-bold">{site} Post</h2>
            <div>
              {component.state.isLoading ? (
                <Spinner />
              ) : (
                <div className="space-y-4">
                  <div>{component.state.post}</div>
                  <hr />
                  <PostFeedback
                    messageUrl={component.endpoints.message}
                    approvalUrl={component.endpoints.approval}
                  />
                </div>
              )}
            </div>
          </div>
        );
      }}
      whenCompleted={(component) => {
        return (
          <div className="border rounded p-4 space-y-2">
            <h2 className="text-md font-bold">{site} Post</h2>
            <div>
              <div className="space-y-4">
                <div>{component.state.post}</div>
                <hr />
                <div>✅ Approved</div>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

function Posts() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component) {
    return null;
  }

  const { components } = component;
  const potentialComponents = [
    components.InstagramPost,
    components.FacebookPost,
    components.TwitterPost,
  ].filter(Boolean);

  if (!potentialComponents.length) {
    return null;
  }

  console.log(components);

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold">Posts</h2>
      <div className="space-y-4">
        {components.TwitterPost ? (
          <Post id={components.TwitterPost} site="Twitter" />
        ) : null}
        {components.FacebookPost ? (
          <Post id={components.FacebookPost} site="Facebook" />
        ) : null}
        {components.InstagramPost ? (
          <Post id={components.InstagramPost} site="Instagram" />
        ) : null}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-e-transparent align-[-0.125em] text-surface motion-reduce:animate-[spin_1.5s_linear_infinite] dark:text-red-700"
      role="status"
    >
      <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
        Loading...
      </span>
    </div>
  );
}

function GeneratingKeyPoints() {
  return Synxio.Component({
    name: "KeyPoints",
    whenRunning: () => (
      <div className="flex gap-2 items-center bg-white rounded px-2 py-1 text-zinc-800">
        <Spinner />
        Generating key points...
      </div>
    ),
  });
}

function KeyPoints({ keyPoints }: { keyPoints: string[] }) {
  if (!keyPoints.length) {
    return null;
  }
  return (
    <div>
      <h2 className="text-lg font-bold">Key Points</h2>
      <ul className="list-disc ml-4">
        {keyPoints.map((k, idx) => {
          return <li key={idx}>{k}</li>;
        })}
      </ul>
    </div>
  );
}

const ArticleSchema = z.object({
  article: z.string().min(1),
  instagram: z.boolean().default(false),
  facebook: z.boolean().default(false),
  twitter: z.boolean().default(false),
});

type ArticleSchema = z.infer<typeof ArticleSchema>;

function InitialPayload({ url }: { url: string }) {
  const form = useForm<ArticleSchema>({
    resolver: zodResolver(ArticleSchema),
    defaultValues: {
      instagram: false,
      facebook: false,
      twitter: false,
    },
  });

  const onSubmit = (data: ArticleSchema) => {
    fetch(`http://localhost:3000/${url}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="article"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Article</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Article" />
                </FormControl>
                <FormDescription>
                  Write an article, and we'll generate social media posts for
                  you!
                </FormDescription>
              </FormItem>
            )}
          ></FormField>
          <FormField
            control={form.control}
            name="twitter"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Generate Twitter post
                </FormLabel>
              </FormItem>
            )}
          ></FormField>
          <FormField
            control={form.control}
            name="facebook"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Generate Facebook post
                </FormLabel>
              </FormItem>
            )}
          ></FormField>
          <FormField
            control={form.control}
            name="instagram"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Generate Instagram post
                </FormLabel>
              </FormItem>
            )}
          ></FormField>
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </div>
  );
}

export default function Home() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component) {
    return null;
  }

  const initialPayloadUrl = component.endpoints.initialPayload;
  return (
    <div className="max-w-3xl mx-auto text-sm flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Social Media Generator</h1>
      {!component.state.article ? (
        <InitialPayload url={initialPayloadUrl} />
      ) : null}
      <GeneratingKeyPoints />
      <KeyPoints keyPoints={component.state.keyPoints} />
      <Posts />
      {component.status === "completed" ? "🎉 Done!" : null}
    </div>
  );
}
