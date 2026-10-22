import type { DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import {
  AlignLeft,
  ArrowUpRight,
  AtSign,
  CalendarDays,
  CheckSquare,
  CircleDot,
  Clock3,
  FileText,
  Hash,
  Link2,
  ListChecks,
  MapPin,
  MousePointerClick,
  Paperclip,
  Phone,
  Search,
  ShieldCheck,
  Sigma,
  Sparkles,
  Type,
  UserRound,
  Users,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

type PropertyTypeIcon = (props: ComponentProps<'svg'>) => ReactNode;

/**
 * The property picker is a dense visual menu in Notion. Keep the icon mapping
 * in one place so the table header, inline property picker, and advanced
 * property surfaces never drift apart as the schema vocabulary grows.
 */
const PROPERTY_TYPE_ICONS: Record<DatabasePropertyType, PropertyTypeIcon> = {
  title: (props) => <Type {...props} />,
  text: (props) => <AlignLeft {...props} />,
  number: (props) => <Hash {...props} />,
  checkbox: (props) => <CheckSquare {...props} />,
  date: (props) => <CalendarDays {...props} />,
  select: (props) => <CircleDot {...props} />,
  status: (props) => <Sparkles {...props} />,
  multi_select: (props) => <ListChecks {...props} />,
  url: (props) => <Link2 {...props} />,
  email: (props) => <AtSign {...props} />,
  phone: (props) => <Phone {...props} />,
  created_time: (props) => <Clock3 {...props} />,
  last_edited_time: (props) => <Clock3 {...props} />,
  created_by: (props) => <UserRound {...props} />,
  last_edited_by: (props) => <UserRound {...props} />,
  verification: (props) => <ShieldCheck {...props} />,
  button: (props) => <MousePointerClick {...props} />,
  unique_id: (props) => <Hash {...props} />,
  place: (props) => <MapPin {...props} />,
  person: (props) => <Users {...props} />,
  files: (props) => <Paperclip {...props} />,
  relation: (props) => <ArrowUpRight {...props} />,
  formula: (props) => <Sigma {...props} />,
  rollup: (props) => <Search {...props} />,
};

export function DatabasePropertyTypeIcon({
  type,
  className,
  ...props
}: { type: DatabasePropertyType } & ComponentProps<'svg'>) {
  const Icon = PROPERTY_TYPE_ICONS[type] ?? FileText;
  return (
    <Icon
      {...props}
      className={className}
      aria-hidden="true"
      data-database-property-type-icon={type}
    />
  );
}
