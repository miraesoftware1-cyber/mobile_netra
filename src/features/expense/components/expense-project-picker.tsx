"use client";

import { useEffect, useMemo, useState } from "react";
import { useMedia } from "react-use";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useExpenseProjectsQuery } from "@/features/expense/hooks/use-expense-projects-query";
import type { ExpenseProjectItem } from "@/features/expense/api";

function projectMatchesQuery(
  item: ExpenseProjectItem,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  if (item.prj_name.includes(q)) return true;
  const lower = q.toLowerCase();
  return item.prj_code.toLowerCase().includes(lower);
}

export type ExpenseProjectPickerProps = {
  companyCode: string | undefined;
  value: string;
  onValueChange: (prjCode: string) => void;
  invalid?: boolean;
};

export function ExpenseProjectPicker({
  companyCode,
  value,
  onValueChange,
  invalid,
}: ExpenseProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const autofocusSearch = useMedia("(hover: hover) and (pointer: fine)", false);

  const {
    data: projects = [],
    isLoading,
    isError,
  } = useExpenseProjectsQuery(companyCode);

  useEffect(() => {
    if (!open) return;
    setSearch("");
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    return projects.find((p) => p.prj_code === value)?.prj_name ?? "";
  }, [projects, value]);

  const filtered = useMemo(
    () => projects.filter((p) => projectMatchesQuery(p, search)),
    [projects, search],
  );

  const handlePick = (code: string) => {
    onValueChange(code);
    setOpen(false);
  };

  const triggerLabel = (() => {
    if (!companyCode) return "회사 정보를 확인할 수 없습니다";
    if (isLoading) return "불러오는 중...";
    if (isError) return "불러오지 못했습니다";
    if (!projects.length) return "선택 가능한 프로젝트가 없습니다";
    if (value && selectedLabel) return selectedLabel;
    return "프로젝트를 선택하세요";
  })();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!companyCode || isLoading || isError || projects.length === 0}
        aria-invalid={invalid}
        onClick={() => setOpen(true)}
        className={cn(
          "h-11 min-w-0 w-full justify-between border-gray-200 px-3 font-normal",
          !value &&
            companyCode &&
            !isLoading &&
            !isError &&
            projects.length > 0 &&
            "text-gray-400",
          invalid && "border-red-500",
        )}
      >
        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex h-[min(85dvh,640px)] max-h-dvh w-full max-w-[430px] flex-col gap-0 overflow-hidden rounded-t-2xl border-x-0 border-t p-0"
        >
          <SheetHeader className="shrink-0 space-y-0 border-b border-gray-100 px-4 pb-3 pt-2 text-left">
            <SheetTitle className="text-base font-semibold">
              프로젝트 선택
            </SheetTitle>
            <SheetDescription className="sr-only">
              검색으로 목록을 좁힌 뒤 프로젝트를 선택할 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로젝트명으로 검색"
                autoComplete="off"
                className="h-11 border-gray-200 pl-9"
                autoFocus={autofocusSearch}
                enterKeyHint="search"
              />
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2"
            role="listbox"
            aria-label="프로젝트 목록"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-gray-500">
                  검색 결과가 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {filtered.map((row) => {
                    const selected = row.prj_code === value;
                    return (
                      <li key={row.prj_code}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => handlePick(row.prj_code)}
                          className={cn(
                            "w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium leading-snug transition-colors",
                            selected
                              ? "bg-primary/10 text-primary"
                              : "text-gray-900 hover:bg-gray-100",
                          )}
                        >
                          <span className="line-clamp-3">{row.prj_name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
