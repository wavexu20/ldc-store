"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface ProductImageGalleryProps {
  productName: string;
  images: string[];
}

export function ProductImageGallery({
  productName,
  images,
}: ProductImageGalleryProps) {
  const { t } = useI18n();
  const safeImages = useMemo(() => images.filter((url) => url.trim().length > 0), [images]);
  const [selectedUrl, setSelectedUrl] = useState(() => safeImages[0] ?? "");
  const displayUrl = safeImages.includes(selectedUrl) ? selectedUrl : safeImages[0] ?? "";

  if (safeImages.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted/30">
        <Image
          src={displayUrl}
          alt={productName}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority
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
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    : "hover:border-primary/40"
                )}
              >
                <Image
                  src={url}
                  alt={`${productName} - ${t("imageOf", { index: index + 1, total: safeImages.length })}`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
