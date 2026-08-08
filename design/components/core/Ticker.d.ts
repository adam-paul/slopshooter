export interface TickerProps {
  items: Array<{ verdict: 'ai' | 'mixed' | 'human'; tagger: string; target: string; ago: string }>;
  duration?: number;
}
export declare function Ticker(props: TickerProps): JSX.Element;
