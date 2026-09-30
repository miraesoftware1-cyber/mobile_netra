"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerFieldProps {
  value: string;          // yyyy-MM-dd
  onChange: (v: string) => void;
  label?: string;         // floating label (기준일, 촉진일 등)
  placeholder?: string;
  holidayDates?: Set<string>;  // yyyy-MM-dd 형식, 공휴일 빨간색 표시
  className?: string;
}

export function DatePickerField({
  value, onChange, label, placeholder = "날짜 선택", holidayDates = new Set(), className,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  const ColoredDayButton = useMemo(() => {
    const dates = holidayDates;
    return function DayButtonColored(props: React.ComponentProps<typeof CalendarDayButton>) {
      const { day, modifiers, className: cls } = props;
      const dow = day.date.getDay();
      const dateStr = format(day.date, "yyyy-MM-dd");
      const isRed  = dow === 0 || dates.has(dateStr);
      const isBlue = dow === 6 && !isRed;
      return (
        <CalendarDayButton
          {...props}
          className={cn(
            cls,
            !modifiers.selected && !modifiers.disabled && isBlue && "text-blue-500 hover:text-blue-600",
            !modifiers.selected && !modifiers.disabled && isRed  && "text-red-500  hover:text-red-600",
          )}
        />
      );
    };
  }, [holidayDates]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-11 w-full border border-gray-200 rounded-lg bg-gray-50 text-left focus:outline-none overflow-hidden",
            label ? "flex flex-col justify-center px-3 gap-0.5" : "flex items-center px-2 gap-1",
            className,
          )}
        >
          {label ? (
            <>
              <span className="text-[10px] text-gray-400 leading-none">{label}</span>
              <span className="text-sm text-gray-700 leading-tight">
                {value ? value.replace(/-/g, '.') : placeholder}
              </span>
            </>
          ) : (
            <>
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="text-[13px] text-gray-700">
                {value ? value.replace(/-/g, '.') : <span className="text-gray-400">{placeholder}</span>}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[300] w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => { onChange(date ? format(date, "yyyy-MM-dd") : ""); setOpen(false); }}
          locale={ko}
          formatters={{
            formatCaption: (date) => format(date, "yyyy년 M월", { locale: ko }),
            formatWeekdayName: (date) => format(date, "eeeee", { locale: ko }),
          }}
          components={{ DayButton: ColoredDayButton }}
        />
      </PopoverContent>
    </Popover>
  );
}
