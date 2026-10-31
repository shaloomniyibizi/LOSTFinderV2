"use client";

import { Suspense } from "react";
import ItemsBrowser from "@/components/ItemsBrowser";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <ItemsBrowser />
    </Suspense>
  );
}
