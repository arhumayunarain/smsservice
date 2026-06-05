"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createTemplate } from "@/lib/api";

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const template = await createTemplate({ name: name.trim(), body: body.trim() });
      router.push(`/templates/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/templates"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Templates
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">New Template</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a reusable message template with {"{variable}"} placeholders.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Template Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome Message"
            required
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="body"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Message Body
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {firstName}, your order {orderId} has been confirmed!"
            required
            rows={5}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
          />
          <p className="text-xs text-muted-foreground/70 mt-1">
            Use {"{variableName}"} for personalization placeholders.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !name.trim() || !body.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create Template"}
          </button>
          <Link
            href="/templates"
            className="px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
