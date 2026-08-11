import type { ModulePlan } from "@kf/contracts";

const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
const placement = (order: number, preferredHeight: "compact" | "small" | "medium" | "large" | "full" = "large") => ({ region: "main" as const, order, columnSpan: 12, preferredHeight, alignment: "stretch" as const, emphasis: "primary" as const });

export function createPortalPlan(): ModulePlan {
  return {
    schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme,
    assets: [{ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait photo" }, { id: "project", kind: "image", name: "Project", mimeType: "image/png", description: "Portfolio cover" }],
    pages: [{ id: "home", title: "Portfolio", mode: "vertical-flow", modules: [
      { id: "portal-hero", kind: "content.hero", templateVersion: "1.0.0", variant: "portrait-right", title: "Profile", content: JSON.stringify({ title: "Lin Xiaoming", subtitle: "Full-stack designer", description: "Building useful digital products", primaryAction: "Contact" }), placement: placement(0), interactions: [{ type: "scroll", moduleId: "portal-portfolio" }], assetId: "portrait" },
      { id: "portal-kpis", kind: "metric.kpi-grid", templateVersion: "1.0.0", variant: "default", title: "Highlights", content: JSON.stringify({ items: [{ label: "Experience", value: "5 years" }, { label: "Projects", value: "40+" }, { label: "Clients", value: "12" }] }), placement: placement(1, "medium"), interactions: [] },
      { id: "portal-portfolio", kind: "content.card-grid", templateVersion: "1.0.0", variant: "portfolio", title: "Portfolio", content: JSON.stringify({ items: [{ title: "Mobile App", summary: "Product experience design", tag: "Mobile", action: "View" }, { title: "Brand Site", summary: "Corporate website", tag: "Web", action: "View" }] }), placement: placement(2, "full"), interactions: [{ type: "open-modal", moduleId: "portal-contact" }], assetId: "project" },
      { id: "portal-timeline", kind: "content.timeline", templateVersion: "1.0.0", variant: "experience", title: "Experience", content: JSON.stringify({ items: [{ date: "2024", title: "Senior designer", detail: "Leading experience design" }, { date: "2021", title: "Product designer", detail: "Creating user interfaces" }] }), placement: placement(3, "medium"), interactions: [] },
      { id: "portal-contact", kind: "form.record-editor", templateVersion: "1.0.0", variant: "contact", title: "Contact", content: JSON.stringify({ fields: [{ id: "name", label: "Name", placeholder: "Your name" }, { id: "email", label: "Email", placeholder: "name@example.com" }], submitLabel: "Send message" }), placement: placement(4), interactions: [{ type: "submit", action: "send-message" }] },
    ] }], operations: [],
  };
}
