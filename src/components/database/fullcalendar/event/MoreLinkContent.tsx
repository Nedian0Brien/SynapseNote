import { CalendarApi, MoreLinkArg, MoreLinkContentArg } from "@fullcalendar/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

import { MoreLinkPopoverContent } from "./MoreLinkPopoverContent";
    
export function MoreLinkContent({ data, moreLinkInfo, calendar, onClose }: {
  moreLinkInfo?: MoreLinkArg;
  data: MoreLinkContentArg;
  calendar: CalendarApi;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { num } = data;

  const [open, setOpen] = useState(false);

  return <Popover open={open} onOpenChange={open => {
    if (!open) {
      onClose()
    }

    setOpen(open)
  }}>
    <PopoverTrigger className="p-1 focus-within:outline-none text-text-primary rounded-200 text-left hover:bg-fill-content-hover w-full"> {t('calendar.more', { num })}</PopoverTrigger>
    <PopoverContent side='top' sideOffset={-50} align="center" className="min-w-[180px] w-[180px] max-w-[180px]">
      {moreLinkInfo && <MoreLinkPopoverContent moreLinkInfo={moreLinkInfo} calendar={calendar} onClose={() => {
        setOpen(false)
      }} />}
    </PopoverContent>
  </Popover>
}