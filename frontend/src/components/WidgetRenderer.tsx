import type { DisplayWidget } from '../types'
import ErrorBoundary from './ErrorBoundary'
import TextWidget from './display/TextWidget'
import SectionHeader from './display/SectionHeader'
import DataTable from './display/DataTable'
import Comparison from './display/Comparison'
import CategoryList from './display/CategoryList'
import QuoteHighlight from './display/QuoteHighlight'
import MetricBars from './display/MetricBars'
import CopyableBlock from './display/CopyableBlock'
import ProgressBar from './display/ProgressBar'
import FinalResult from './display/FinalResult'
import TimerWidget from './display/TimerWidget'

interface Props {
  widget: DisplayWidget
}

function WidgetInner({ widget }: Props) {
  const w = widget as any
  switch (w.type) {
    case 'text':
      return <TextWidget {...w} />
    case 'section_header':
      return <SectionHeader {...w} />
    case 'data_table':
    case 'competitor_table':
      return <DataTable {...w} />
    case 'comparison':
    case 'comparison_card':
      return <Comparison {...w} />
    case 'category_list':
    case 'alignment_map':
      return <CategoryList {...w} />
    case 'quote_highlight':
      return <QuoteHighlight {...w} />
    case 'metric_bars':
    case 'strength_meter':
      return <MetricBars {...w} />
    case 'copyable':
      return <CopyableBlock {...w} />
    case 'progress':
      return <ProgressBar {...w} />
    case 'final_result':
      return <FinalResult {...w} />
    case 'timer':
      return <TimerWidget {...w} />
    default:
      return <pre className="widget widget-fallback">{JSON.stringify(widget, null, 2)}</pre>
  }
}

export default function WidgetRenderer({ widget }: Props) {
  return (
    <ErrorBoundary>
      <WidgetInner widget={widget} />
    </ErrorBoundary>
  )
}
