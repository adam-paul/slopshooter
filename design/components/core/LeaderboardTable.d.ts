export interface LeaderboardTableProps {
  rows: Array<{ rank: number; handle: string; checks: number; ai: number; mixed: number; human: number; score: string; lastAt: string }>;
}
export declare function LeaderboardTable(props: LeaderboardTableProps): JSX.Element;
