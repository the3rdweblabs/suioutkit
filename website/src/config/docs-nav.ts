export type NavItem = {
  title: string;
  href?: string;
  children?: NavItem[];
};

export const docsNav: NavItem[] = [
  {
    title: "Getting Started",
    children: [
      { title: "Installation", href: "/docs/getting-started/installation" },
      { title: "Quick Start", href: "/docs/getting-started/quick-start" },
      { title: "How It Works", href: "/docs/getting-started/how-it-works" },
    ],
  },
  {
    title: "Guides",
    children: [
      { title: "Architecture", href: "/docs/guides/architecture" },
      { title: "SDK Reference", href: "/docs/guides/sdk" },
      { title: "Backend API", href: "/docs/guides/backend-api" },
      { title: "Environment (operators)", href: "/docs/guides/environment" },
      { title: "Security", href: "/docs/guides/security" },
    ],
  },
  {
    title: "Reference",
    children: [
      { title: "Hosted API", href: "/docs/hosted-api" },
      { title: "Developer Guide", href: "/docs/developer-guide" },
    ],
  },
];

export function flattenNav(items: NavItem[]): { title: string; href: string }[] {
  const out: { title: string; href: string }[] = [];
  for (const item of items) {
    if (item.href) out.push({ title: item.title, href: item.href });
    if (item.children) out.push(...flattenNav(item.children));
  }
  return out;
}
