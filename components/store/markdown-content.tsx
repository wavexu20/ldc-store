"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface MarkdownImage {
  src: string;
  alt: string;
}

interface MarkdownContentProps {
  html: string;
  className?: string;
}

function imageFromTarget(target: EventTarget | null): MarkdownImage | null {
  if (!(target instanceof HTMLImageElement)) return null;
  return {
    src: target.currentSrc || target.src,
    alt: target.alt || "商品图片",
  };
}

export function MarkdownContent({ html, className }: MarkdownContentProps) {
  const [activeImage, setActiveImage] = useState<MarkdownImage | null>(null);

  const openImage = (image: MarkdownImage, event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    setActiveImage(image);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const image = imageFromTarget(event.target);
    if (image) openImage(image, event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const image = imageFromTarget(event.target);
    if (image) openImage(image, event);
  };

  return (
    <>
      <div
        className={cn(
          "[&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img]:duration-200 [&_img]:hover:opacity-90 [&_img]:focus-visible:outline-2 [&_img]:focus-visible:outline-offset-4 [&_img]:focus-visible:outline-ring",
          className
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Dialog open={Boolean(activeImage)} onOpenChange={(open) => !open && setActiveImage(null)}>
        <DialogContent
          className="max-w-[min(96vw,1200px)] border-0 bg-transparent p-0 shadow-none sm:max-w-[min(96vw,1200px)] [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-black/70 [&_[data-slot=dialog-close]]:p-2 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100"
        >
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          <DialogDescription className="sr-only">放大查看商品详情图片，按 Escape 键关闭。</DialogDescription>
          {activeImage ? (
            <figure className="flex max-h-[92vh] min-h-24 flex-col items-center justify-center overflow-hidden rounded-xl bg-black/90">
              {/* Arbitrary R2/external Markdown URLs cannot be statically allow-listed for next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImage.src}
                alt={activeImage.alt}
                className="max-h-[86vh] max-w-full object-contain"
              />
              {activeImage.alt ? (
                <figcaption className="max-w-full px-4 py-2 text-center text-xs text-white/75">
                  {activeImage.alt}
                </figcaption>
              ) : null}
            </figure>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
