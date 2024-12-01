import type { Route } from "./+types/social-media-generator";
import { Welcome } from "../welcome/welcome";
import { useSynxio, useSynxioCallEndpoint, Synxio } from "~/lib/synxio";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "~/components/ui/form";
import { AnyEndpointRef, EndpointRef } from "@repo/core";
import { Spinner } from "~/components/spinner";
import { Post } from "~/components/post";
import { KeyPoints } from "~/components/key-points";

function Posts() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component || component.status === "forbidden") {
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
          <Post id={components.TwitterPost} site="twitter" />
        ) : null}
        {components.FacebookPost ? (
          <Post id={components.FacebookPost} site="facebook" />
        ) : null}
        {components.InstagramPost ? (
          <Post id={components.InstagramPost} site="instagram" />
        ) : null}
      </div>
    </div>
  );
}

function SocialMediaGeneratorInner() {
  const component = useSynxio("SocialMediaGenerator");

  if (!component) {
    return null;
  }

  if (component.status === "forbidden") {
    return <div>You are not authorized to access this component</div>;
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Social Media Post Generator</h1>
      <KeyPoints />
      <Posts />
      {component.status === "completed" ? "🎉 Done!" : null}
    </div>
  );
}

export default function SocialMediaGenerator({ params }: Route.ComponentProps) {
  const appId = params.appId;
  return (
    <Synxio.Provider appId={appId}>
      <SocialMediaGeneratorInner />
    </Synxio.Provider>
  );
}
