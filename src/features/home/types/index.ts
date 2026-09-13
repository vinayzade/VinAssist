import type { ActivityKind } from '@/services/api';
import type {
  MainTabParamList,
  MainToolRoute,
} from '@/navigation/navigationTypes';

/** Anywhere a dashboard card can send the user: a tool flow or a sibling tab. */
export type DashboardRoute =
  | MainToolRoute
  | Exclude<keyof MainTabParamList, 'Home'>;

export interface DashboardAction {
  id: string;
  title: string;
  /** One line under the title; omitted on compact tiles. */
  description?: string;
  /** Single-character glyph shown in the tinted badge. */
  glyph: string;
  route: DashboardRoute;
  /** Accent used for the badge; keeps the grid visually distinct. */
  tone?: 'primary' | 'accent' | 'info' | 'success' | 'warning';
}

/** Presentation details for a history kind, used by the activity list. */
export interface ActivityKindMeta {
  label: string;
  glyph: string;
  route: DashboardRoute;
}

export type ActivityKindMap = Record<ActivityKind, ActivityKindMeta>;
