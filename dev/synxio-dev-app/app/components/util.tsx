import { Facebook, Instagram, Twitter } from "lucide-react";

export type SocialMediaSite = "twitter" | "facebook" | "instagram";

export const siteNameToTitle = {
  twitter: "Twitter",
  facebook: "Facebook",
  instagram: "Instagram",
} as const;

export const siteNameToIcon = {
  twitter: <Twitter className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
} as const;
