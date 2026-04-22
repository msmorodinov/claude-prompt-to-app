export interface TextWidget {
  type: 'text'
  content: string
}

export interface SectionHeaderWidget {
  type: 'section_header'
  title: string
  subtitle?: string
}

export interface DataTableWidget {
  type: 'data_table' | 'competitor_table'
  columns?: string[]
  rows?: string[][]
  caption?: string
  highlights?: Record<string, string[]>
}

export interface ComparisonWidget {
  type: 'comparison' | 'comparison_card'
  left: { label: string; content: string }
  right: { label: string; content: string }
  note?: string
  diff_note?: string
}

export interface CategoryListWidget {
  type: 'category_list' | 'alignment_map'
  categories: Array<{
    label: string
    items: string[]
    style?: 'default' | 'success' | 'warning' | 'error'
  }>
}

export interface QuoteHighlightWidget {
  type: 'quote_highlight'
  quote: string
  attribution?: string
  source?: string
  note?: string
  comment?: string
}

export interface MetricBarsWidget {
  type: 'metric_bars' | 'strength_meter'
  metrics: Array<{
    label: string
    value: number
    max: number
    unit?: string
  }>
}

export interface CopyableWidget {
  type: 'copyable'
  label?: string
  content: string
}

export interface ProgressWidget {
  type: 'progress'
  label: string
  percent: number
}

export interface FinalResultWidget {
  type: 'final_result'
  content: string
}

export interface TimerWidget {
  type: 'timer'
  seconds: number
  label?: string
}

export interface GalleryImage {
  id: string
  file: string
  url?: string
  caption?: string
  seq?: number
}

export interface ImageGalleryWidget {
  type: 'image_gallery'
  title?: string
  images: GalleryImage[]
}

export interface FileDownloadWidget {
  type: 'file_download'
  kind?: 'zip'
  label?: string
  filename: string
}

export type DisplayWidget =
  | TextWidget
  | SectionHeaderWidget
  | DataTableWidget
  | ComparisonWidget
  | CategoryListWidget
  | QuoteHighlightWidget
  | MetricBarsWidget
  | CopyableWidget
  | ProgressWidget
  | FinalResultWidget
  | TimerWidget
  | ImageGalleryWidget
  | FileDownloadWidget

export type SelectOption = string | { value: string; label: string }

export interface SingleSelectQuestion {
  type: 'single_select'
  id: string
  label: string
  options: SelectOption[]
  allow_custom?: boolean
}

export interface MultiSelectQuestion {
  type: 'multi_select'
  id: string
  label: string
  options: SelectOption[]
  min_select?: number
  max_select?: number
}

export function normalizeOption(opt: SelectOption): string {
  if (typeof opt === 'string') return opt
  return opt.label || opt.value || String(opt)
}

export interface FreeTextQuestion {
  type: 'free_text'
  id: string
  label: string
  placeholder?: string
  max_words?: number
  multiline?: boolean
}

export interface RankPrioritiesQuestion {
  type: 'rank_priorities'
  id: string
  label: string
  items: string[]
}

export interface SliderScaleQuestion {
  type: 'slider_scale'
  id: string
  label: string
  min: number
  max: number
  step?: number
  min_label?: string
  max_label?: string
}

export interface Matrix2x2Question {
  type: 'matrix_2x2'
  id: string
  label: string
  x_axis: string
  y_axis: string
  items: string[]
}

export interface TagInputQuestion {
  type: 'tag_input'
  id: string
  label: string
  min_tags?: number
  max_tags?: number
  placeholder?: string
}

export interface ImageSelectQuestion {
  type: 'image_select'
  id: string
  label: string
  multi?: boolean
  min_select?: number
  max_select?: number
  images: GalleryImage[]
}

export type InputQuestion =
  | SingleSelectQuestion
  | MultiSelectQuestion
  | FreeTextQuestion
  | RankPrioritiesQuestion
  | SliderScaleQuestion
  | Matrix2x2Question
  | TagInputQuestion
  | ImageSelectQuestion

export interface AssistantMessageEvent {
  type: 'assistant_message'
  blocks: DisplayWidget[]
}

export interface AskMessageEvent {
  type: 'ask_message'
  id: string
  preamble?: string
  questions: InputQuestion[]
}

export interface UserMessageEvent {
  type: 'user_message'
  answers: Record<string, unknown>
}

export interface ResearchStartEvent {
  type: 'research_start'
  label: string
}

export interface ResearchDoneEvent {
  type: 'research_done'
  label: string
}

export interface StreamDeltaEvent {
  type: 'stream_delta'
  text: string
}

export interface DoneEvent {
  type: 'done'
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export interface AskTimeoutEvent {
  type: 'ask_timeout'
  message: string
}

export interface TokenUsageEvent {
  type: 'token_usage'
  input_tokens: number
  output_tokens: number
}

export type SSEEvent =
  | AssistantMessageEvent
  | AskMessageEvent
  | UserMessageEvent
  | ResearchStartEvent
  | ResearchDoneEvent
  | StreamDeltaEvent
  | DoneEvent
  | ErrorEvent
  | AskTimeoutEvent
  | TokenUsageEvent

export interface ChatAssistantMessage {
  role: 'assistant'
  blocks: DisplayWidget[]
  streaming?: boolean
  streamText?: string
}

export interface ChatAskMessage {
  role: 'ask'
  id: string
  preamble?: string
  questions: InputQuestion[]
  answered: boolean
  answers?: Record<string, unknown>
}

export interface ChatUserMessage {
  role: 'user'
  answers: Record<string, unknown>
}

export interface ChatResearchMessage {
  role: 'research'
  label: string
  done: boolean
}

export type ChatMessage =
  | ChatAssistantMessage
  | ChatAskMessage
  | ChatUserMessage
  | ChatResearchMessage
