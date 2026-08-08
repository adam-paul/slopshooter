export interface PodiumCardProps {
  rank: 1 | 2 | 3;
  handle: string;
  score: string;
  checks: number;
  ai: number;
  mixed: number;
  human: number;
  lastAt: string;
}
export declare function PodiumCard(props: PodiumCardProps): JSX.Element;
