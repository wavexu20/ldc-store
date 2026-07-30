"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cancelPendingOrder, resumePendingOrderPayment } from "@/lib/actions/orders";
import { launchPayment } from "@/lib/payment/launch-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PendingOrderActionsProps {
  orderNo: string;
  accessToken?: string;
  className?: string;
  onChanged?: () => void | Promise<void>;
}

export function PendingOrderActions({
  orderNo,
  accessToken,
  className,
  onChanged,
}: PendingOrderActionsProps) {
  const { t } = useI18n();
  const [isResuming, startResume] = useTransition();
  const [isCancelling, startCancel] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  const resumePayment = () => {
    startResume(async () => {
      const result = await resumePendingOrderPayment(orderNo, accessToken);
      if (!result.success || !result.paymentForm) {
        toast.error(result.message);
        await onChanged?.();
        return;
      }
      try {
        launchPayment(result.paymentForm);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("cannotOpenPayment"));
      }
    });
  };

  const cancelOrder = () => {
    startCancel(async () => {
      const result = await cancelPendingOrder(orderNo, accessToken);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setCancelOpen(false);
      await onChanged?.();
    });
  };

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)} onClick={(event) => event.stopPropagation()}>
      <Button type="button" size="sm" onClick={resumePayment} disabled={isResuming || isCancelling}>
        {isResuming ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}
        {t("continuePayment")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={isResuming || isCancelling}>
        <XCircle className="mr-1.5 h-3.5 w-3.5" />
        {t("cancelOrder")}
      </Button>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelOrderTitle")}</DialogTitle>
            <DialogDescription>
              {t("cancelOrderDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={isCancelling}>
              {t("keepOrder")}
            </Button>
            <Button type="button" variant="destructive" onClick={cancelOrder} disabled={isCancelling}>
              {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("confirmCancelOrder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
