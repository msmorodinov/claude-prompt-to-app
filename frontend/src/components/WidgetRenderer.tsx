import type { DisplayWidget } from '../types'
import TextWidget from './display/TextWidget'
import SectionHeader from './display/SectionHeader'
import CompetitorTable from './display/CompetitorTable'
import ComparisonCard from './display/ComparisonCard'
import AlignmentMap from './display/AlignmentMap'
import QuoteHighlight from './display/QuoteHighlight'
import StrengthMeter from './display/StrengthMeter'
import CopyableBlock from './display/CopyableBlock'
import ProgressBar from './display/ProgressBar'
import FinalResult from './display/FinalResult'
import TimerWidget from './display/TimerWidget'

interface Props {
  widget: DisplayWidget
}

export default function WidgetRenderer({ widget }: Props) {
  switch (widget.type) {
    case 'text':
      return <TextWidget {...widget} />
    case 'section_header':
      return <SectionHeader {...widget} />
    case 'competitor_table':
      return <CompetitorTable {...widget} />
    case 'comparison_card':
      return <ComparisonCard {...widget} />
    case 'alignment_map':
      return <AlignmentMap {...widget} />
    case 'quote_highlight':
      return <QuoteHighlight {...widget} />
    case 'strength_meter':
      return <StrengthMeter {...widget} />
    case 'copyable':
      return <CopyableBlock {...widget} />
    case 'progress':
      return <ProgressBar {...widget} />
    case 'final_result':
      return <FinalResult {...widget} />
    case 'timer':
      return <TimerWidget {...widget} />
    default:
      return <pre className="widget widget-fallback">{JSON.stringify(widget, null, 2)}</pre>
  }
}
