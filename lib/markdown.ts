import sanitizeHtml from "sanitize-html";
import type { IOptions } from "sanitize-html";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS: IOptions["allowedTags"] = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "a",
  "img",
  "video",
  "source",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTRIBUTES: IOptions["allowedAttributes"] = {
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
  video: ["src", "controls", "preload", "poster", "width", "height", "playsinline"],
  source: ["src", "type"],
  code: ["class"],
  pre: ["class"],
};

export function renderMarkdownToSafeHtml(markdown: string): string {
  if (!markdown) return "";

  const parsed = marked.parse(markdown);
  const rawHtml = typeof parsed === "string" ? parsed : "";
  const cleanHtml = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
      video: ["http", "https"],
      source: ["http", "https"],
    },
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "nofollow noopener noreferrer",
          target: "_blank",
        },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: "lazy", decoding: "async" },
      }),
      video: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, controls: "", preload: "metadata", playsinline: "" },
      }),
    },
  });

  return cleanHtml;
}
