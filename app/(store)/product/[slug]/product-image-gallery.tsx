"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface ProductImageGalleryProps {
  productName: string;
  images: string[];
  className?: string;
}

export function ProductImageGallery({
  productName,
  images,
  className,
}: ProductImageGalleryProps) {
  const { t } = useI18n();
  const safeImages = useMemo(() => images.filter((url) => url.trim().length > 0), [images]);
  const [selectedUrl, setSelectedUrl] = useState(() => safeImages[0] ?? "");
  const displayUrl = safeImages.includes(selectedUrl) ? selectedUrl : safeImages[0] ?? "";

  if (safeImages.length === 0) {
    return null;
  }

  return (
    <div className={cn("mb-6", className)}>
      <div className="relative aspect-video overflow-hidden rounded-xl border bg-background">
        <Image
          src={displayUrl}
          alt={productName}
          fill
          sizes="(max-width: 1024px) 100vw, 52vw"
          className="object-cover"
          priority
          unoptimized={displayUrl.startsWith("/api/product-images/")}
        />
      </div>

      {safeImages.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {safeImages.map((url, index) => {
            const isActive = url === displayUrl;
            return (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setSelectedUrl(url)}
                aria-label={t("imageOf", { index: index + 1, total: safeImages.length })}
                className={cn(
                  "relative aspect-video h-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    : "hover:border-primary/40"
                )}
              >
                <Image
                  src={url}
                  alt={`${productName} - ${t("imageOf", { index: index + 1, total: safeImages.length })}`}
                  fill
                  sizes="100px"
                  className="object-cover"
                  unoptimized={url.startsWith("/api/product-images/")}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
