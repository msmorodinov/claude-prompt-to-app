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
      return <TextWidget content={widget.content} />
    case 'section_header':
      return <SectionHeader title={widget.title} subtitle={widget.subtitle} />
    case 'competitor_table':
      return (
        <CompetitorTable
          columns={widget.columns}
          rows={widget.rows}
          competitors={widget.competitors}
          highlights={widget.highlights}
        />
      )
    case 'comparison_card':
      return (
        <ComparisonCard
          left={widget.left}
          right={widget.right}
          diff_note={widget.diff_note}
        />
      )
    case 'alignment_map':
      return (
        <AlignmentMap
          agreed={widget.agreed}
          contradicted={widget.contradicted}
          surprises={widget.surprises}
        />
      )
    case 'quote_highlight':
      return (
        <QuoteHighlight
          quote={widget.quote}
          attribution={widget.attribution}
          source={widget.source}
          note={widget.note}
          comment={widget.comment}
        />
      )
    case 'strength_meter':
      return <StrengthMeter metrics={widget.metrics} />
    case 'copyable':
      return <CopyableBlock content={widget.content} label={widget.label} />
    case 'progress':
      return <ProgressBar label={widget.label} percent={widget.percent} />
    case 'final_result':
      return <FinalResult content={widget.content} />
    case 'timer':
      return <TimerWidget seconds={widget.seconds} label={widget.label} />
    default:
      return <pre className="widget widget-fallback">{JSON.stringify(widget, null, 2)}</pre>
  }
}
