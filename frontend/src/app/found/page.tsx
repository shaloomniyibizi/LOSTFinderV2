"use client";

import { Suspense } from "react";
import ItemsBrowser from "@/components/ItemsBrowser";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ItemsBrowser type="FOUND" />
    </Suspense>
  );
}
