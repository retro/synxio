import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useSynxio, Synxio } from "~/lib/synxio";
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
  return (
    <Synxio.Component
      name="ChatMessage"
      id={id}
      whenRunning={(component) => {
        const {
          register,
          handleSubmit,
          reset,
          formState: { errors, isSubmitSuccessful, isSubmitting },
        } = useForm<FormSchema>({
          resolver: zodResolver(FormSchema),
        });

        const onSubmit = async (data: FormSchema) => {
          const url = component.endpoints.message;

          await fetch(`http://localhost:3000/${url}`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
        };

        if (isSubmitting || component.state.isLoading) {
          return <div>Loading...</div>;
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
      }}
    />
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
  return (
    <Synxio.Component
      name="Chat"
      whenRunning={(component) => (
        <div>
          <h1>Hello</h1>
          {component.state.names.map(({ name, age }, idx) => (
            <div key={idx}>
              {name} - {age}
            </div>
          ))}

          <hr />

          {component.components.ChatMessageResult?.map((c) => (
            <ChatMessageResult id={c} key={c} />
          ))}

          <hr />

          {component.components.ChatMessage ? (
            <ChatMessage id={component.components.ChatMessage} />
          ) : null}
        </div>
      )}
    ></Synxio.Component>
  );
}
