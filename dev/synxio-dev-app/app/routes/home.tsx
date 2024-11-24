import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useSynxio } from "~/lib/synxio";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

const FormSchema = z.object({
  name: z.string().min(1),
});

type FormSchema = z.infer<typeof FormSchema>;

function ChatMessage({ id }: { id: string }) {
  const component = useSynxio("ChatMessage", id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitSuccessful },
  } = useForm<FormSchema>({
    resolver: zodResolver(FormSchema),
  });

  const onSubmit = (data: FormSchema) => {
    const url = component?.endpoints.message;

    if (!url) {
      return;
    }
    fetch(`http://localhost:3000/${url}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  useEffect(() => {
    if (isSubmitSuccessful) {
      reset();
    }
  }, [isSubmitSuccessful]);

  if (!component) {
    return null;
  }

  return (
    <div>
      <h2>{component.name}</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <input {...register("name")} placeholder="Name" />
        {errors.name && <span>This field is required</span>}
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}

function ChatMessageResult({ id }: { id: string }) {
  const component = useSynxio("ChatMessageResult", id);

  if (!component) {
    return null;
  }

  return (
    <div>
      <h2>{component.name}</h2>
      <p>{component.status}</p>
    </div>
  );
}

export default function Home() {
  const value = useSynxio("Chat");

  if (!value) {
    return null;
  }

  return (
    <div>
      <h1>Hello</h1>
      {value.state.names.map(({ name, age }) => (
        <div key={name}>
          {name} - {age}
        </div>
      ))}

      <hr />

      {value.components.ChatMessageResult?.map((c) => (
        <ChatMessageResult id={c} />
      ))}

      <hr />

      {value.components.ChatMessage ? (
        <ChatMessage id={value.components.ChatMessage} />
      ) : null}
    </div>
  );
}
