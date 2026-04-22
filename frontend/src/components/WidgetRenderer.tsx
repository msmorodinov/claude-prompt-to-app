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
import ImageGallery from './display/ImageGallery'
import FileDownload from './display/FileDownload'

interface Props {
  widget: DisplayWidget
  sessionId?: string
}

function WidgetInner({ widget, sessionId }: Props) {
  switch (widget.type) {
    case 'text':
      return <TextWidget {...widget} />
    case 'section_header':
      return <SectionHeader {...widget} />
    case 'data_table':
    case 'competitor_table':
      return <DataTable {...widget} />
    case 'comparison':
    case 'comparison_card':
      return <Comparison {...widget} />
    case 'category_list':
    case 'alignment_map':
      return <CategoryList {...widget} />
    case 'quote_highlight':
      return <QuoteHighlight {...widget} />
    case 'metric_bars':
    case 'strength_meter':
      return <MetricBars {...widget} />
    case 'copyable':
      return <CopyableBlock {...widget} />
    case 'progress':
      return <ProgressBar {...widget} />
    case 'final_result':
      return <FinalResult {...widget} />
    case 'timer':
      return <TimerWidget {...widget} />
    case 'image_gallery':
      return <ImageGallery widget={widget} />
    case 'file_download':
      return <FileDownload widget={widget} sessionId={sessionId} />
    default:
      return <pre className="widget widget-fallback">{JSON.stringify(widget, null, 2)}</pre>
  }
}

export default function WidgetRenderer({ widget, sessionId }: Props) {
  return (
    <ErrorBoundary>
      <WidgetInner widget={widget} sessionId={sessionId} />
    </ErrorBoundary>
  )
}
