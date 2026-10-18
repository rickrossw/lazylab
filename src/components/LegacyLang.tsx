"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLangState } from "@/i18n/client";

export function LegacyLang({ code, to }: { code: string; to: string }) {
  const { setChoice } = useLangState();
  const router = useRouter();
  useEffect(() => {
    setChoice(code);
    router.replace(to + window.location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
