"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchExpenseProjects } from "@/features/expense/api";
import { EXPENSE_REFERENCE_DATA_STALE_TIME_MS } from "@/features/expense/constants/react-query";

export function useExpenseProjectsQuery(companyCode: string | undefined) {
  return useQuery({
    queryKey: ["expenseProjects", companyCode],
    queryFn: async () => {
      if (!companyCode) return [];
      const result = await fetchExpenseProjects(companyCode);
      if (result.success) return result.data;
      const fail = result as { success: false; error: string };
      throw new Error(fail.error);
    },
    enabled: !!companyCode,
    staleTime: EXPENSE_REFERENCE_DATA_STALE_TIME_MS,
  });
}
