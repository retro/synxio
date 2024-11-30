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
import { useNavigate } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

const ArticleSchema = z.object({
  article: z.string().min(1),
  instagram: z.boolean().default(false),
  facebook: z.boolean().default(false),
  twitter: z.boolean().default(false),
});

type ArticleSchema = z.infer<typeof ArticleSchema>;

export default function Home() {
  const navigate = useNavigate();
  const form = useForm<ArticleSchema>({
    resolver: zodResolver(ArticleSchema),
    defaultValues: {
      instagram: false,
      facebook: false,
      twitter: false,
    },
  });

  const onSubmit = async (data: ArticleSchema) => {
    const result = await fetch(`http://localhost:3000/api/initialize`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const resultJson = await result.json();

    if (result.status === 200) {
      navigate(`/social-media-generator/${resultJson.appId}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto text-sm flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Social Media Generator</h1>
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
    </div>
  );
}
