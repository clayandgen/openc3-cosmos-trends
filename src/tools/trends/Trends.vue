<template>
  <top-bar :menus="menus" :title="title" />

  <v-stepper v-model="step" class="stepper" flat alt-labels>
    <v-stepper-header>
      <v-stepper-item title="Load Data" :value="1" :complete="step > 1" />
      <v-divider />
      <v-stepper-item
        title="Analyze"
        :value="2"
        :complete="!!activeTrend"
        :editable="step > 1"
      />
    </v-stepper-header>
  </v-stepper>

  <div class="content-area pa-4">
    <data-load-step
      v-if="step === 1"
      @parsed="onCsvParsed"
      @next="step = 2"
    />
    <analyze-step
      v-if="step === 2"
      ref="analyzeStep"
      :data-columns="dataColumns"
      :csv-metadata="csvMetadata"
      v-model:selected-column="selectedColumn"
      v-model:trend-type="trendType"
      v-model:poly-order="polyOrder"
      v-model:horizon-sec="horizonSec"
      :active-trend="activeTrend"
      v-model:threshold="threshold"
      v-model:show-limits="showLimits"
      :limits-values="limitsValues"
      :time-zone="timeZone"
      :anomaly-result="anomalyResult"
      v-model:sigma-n="sigmaN"
      v-model:show-anomalies="showAnomalies"
      @back="goBackToUpload"
      @calculate="calculateTrend"
      @clear="clearTrend"
    />
  </div>
</template>

<script>
import { TopBar } from '@openc3/vue-common/components'
import { OpenC3Api } from '@openc3/js-common/services'
import DataLoadStep from './DataLoadStep'
import AnalyzeStep from './AnalyzeStep'
import { fitTrend, generatePredictionPoints, trendLabel, detectAnomalies } from '../../lib/trendEngine'
import {
  createChart,
  addTrendSeries,
  removeTrendSeries,
  updateThreshold,
  addAnomalySeries,
  removeAnomalySeries,
} from '../../lib/chartRenderer'

export default {
  components: { TopBar, DataLoadStep, AnalyzeStep },
  data() {
    return {
      title: 'Trends',
      step: 1,
      // Parsed CSV
      parsedData: null,
      headerRow: null,
      csvMetadata: null,
      // Chart state
      chart: null,
      uData: null,
      hasThreshold: false,
      trendSeriesCount: 0,
      // Trend settings
      trendType: 'linear',
      polyOrder: 2,
      horizonSec: 43200,
      selectedColumn: null,
      activeTrend: null,
      threshold: null,
      sigmaN: 2,
      showAnomalies: false,
      anomalyResult: null,
      hasAnomaly: false,
      sigmaBandsRef: { value: null },
      trendPredict: null, // saved predict function for re-running anomaly detection
      trendData: null, // saved data used for trend fitting
      timeZone: 'local',
      limitsValues: null,
      showLimits: false,
      // Reactive ref object passed into the uPlot plugin so it can
      // read the current limits without recreating the chart
      limitsRef: { value: null },
      menus: [
        {
          label: 'File',
          items: [
            {
              label: 'Export Chart as PNG',
              icon: 'mdi-image',
              command: () => this.exportChartPng(),
            },
            {
              label: 'Export Trend as CSV',
              icon: 'mdi-file-delimited',
              command: () => this.exportTrendCsv(),
            },
          ],
        },
      ],
    }
  },
  computed: {
    dataColumns() {
      if (!this.headerRow) return []
      return this.headerRow.slice(1)
    },
  },
  async created() {
    const api = new OpenC3Api()
    try {
      const response = await api.get_setting('time_zone')
      if (response) {
        this.timeZone = response
      }
    } catch (_) {
      // Use default 'local'
    }
  },
  watch: {
    step(newStep) {
      if (newStep === 2) {
        this.$nextTick(() => this.renderChart('analyzeStep', true))
      }
    },
    threshold(val) {
      this.hasThreshold = updateThreshold(this.chart, this.uData, this.hasThreshold, val)
    },
    showLimits(val) {
      this.limitsRef.value = val ? this.limitsValues : null
      if (this.chart) this.chart.redraw()
    },
    horizonSec() {
      if (this.activeTrend) {
        this.calculateTrend()
      }
    },
    sigmaN() {
      if (this.activeTrend && this.showAnomalies) {
        this.runAnomalyDetection()
      }
    },
    showAnomalies(val) {
      if (val && this.activeTrend) {
        this.runAnomalyDetection()
      } else {
        this.clearAnomalyState()
        if (this.chart) this.chart.redraw()
      }
    },
  },
  beforeUnmount() {
    this.destroyChart()
  },
  methods: {
    onCsvParsed(result) {
      this.parsedData = result.data
      this.headerRow = result.headerRow
      this.csvMetadata = result.metadata
      this.selectedColumn = result.headerRow[1]
      this.activeTrend = null
      this.limitsValues = null
      this.showLimits = false
      this.limitsRef.value = null
      this.fetchLimits(result.metadata, result.headerRow[1])
    },

    renderChart(stepRef, includeExistingTrend = false) {
      this.destroyChart()
      const container = this.$refs[stepRef]?.getContainer()
      if (!container || !this.parsedData) return

      const existingTrend =
        includeExistingTrend && this.activeTrend
          ? {
              ...this.activeTrend,
              label: `${this.selectedColumn} ${this.capitalize(this.activeTrend.type)}`,
            }
          : null

      const result = createChart(
        container,
        this.headerRow,
        this.parsedData,
        existingTrend,
        this.threshold,
        this.timeZone,
        this.limitsRef,
        this.sigmaBandsRef,
      )
      if (result) {
        this.chart = result.chart
        this.uData = result.uData
        this.hasThreshold = result.hasThreshold
        this.trendSeriesCount = result.trendSeriesCount
      }
    },

    calculateTrend() {
      if (!this.parsedData || this.parsedData.length < 2) return

      const colIdx = this.headerRow.indexOf(this.selectedColumn)
      if (colIdx < 1) return

      const data = this.parsedData
        .map((row) => [row[0], row[colIdx]])
        .filter(([x, y]) => x != null && y != null && isFinite(y))

      if (data.length < 2) return

      const result = fitTrend(data, {
        type: this.trendType,
        order: this.polyOrder,
      })
      if (!result) return

      const startTs = data[0][0]
      const lastTs = data[data.length - 1][0]

      const points = generatePredictionPoints(
        result.predict,
        startTs,
        lastTs,
        this.horizonSec,
      )

      // Strip all overlays from chart in one pass (anomaly → trend)
      this.stripOverlays()

      this.activeTrend = {
        type: this.trendType,
        r2: result.r2,
        rmse: result.rmse,
        equation: result.equation,
        points,
      }

      // Save predict function and data for re-running anomaly detection on sigma change
      this.trendPredict = result.predict
      this.trendData = data

      if (this.chart && this.uData) {
        const label = `${this.selectedColumn} ${this.capitalize(this.trendType)} Trend`
        this.trendSeriesCount = addTrendSeries(
          this.chart,
          this.uData,
          this.headerRow,
          this.trendSeriesCount,
          this.hasThreshold,
          points,
          label,
        )
      }

      // Run anomaly detection if enabled
      if (this.showAnomalies) {
        this.runAnomalyDetection()
      }

      // Force x-axis to fit the new data range (uPlot doesn't auto-refit on setData)
      if (this.chart && this.uData && this.uData[0].length > 0) {
        this.chart.setScale('x', {
          min: this.uData[0][0],
          max: this.uData[0][this.uData[0].length - 1],
        })
      }
    },

    clearTrend() {
      this.stripOverlays()
      this.activeTrend = null
      this.trendPredict = null
      this.trendData = null
    },

    // Clear anomaly series and state from the chart
    clearAnomalyState() {
      if (this.chart && this.uData && this.hasAnomaly) {
        this.hasAnomaly = removeAnomalySeries(this.chart, this.uData, this.hasAnomaly, this.hasThreshold)
      }
      this.anomalyResult = null
      this.sigmaBandsRef.value = null
    },

    // Remove anomaly + trend overlays from the chart
    stripOverlays() {
      this.clearAnomalyState()
      if (this.chart && this.uData && this.trendSeriesCount > 0) {
        this.trendSeriesCount = removeTrendSeries(
          this.chart,
          this.uData,
          this.headerRow,
          this.trendSeriesCount,
          this.hasThreshold,
        )
      }
    },

    runAnomalyDetection() {
      if (!this.trendPredict || !this.trendData) return

      const result = detectAnomalies(this.trendData, this.trendPredict, this.sigmaN)
      this.anomalyResult = result

      if (this.chart && this.uData) {
        // Compute sigma band arrays aligned to chart timestamps
        const upper = []
        const lower = []
        for (const t of this.uData[0]) {
          const predicted = this.trendPredict(t)
          if (isFinite(predicted)) {
            upper.push(predicted + result.meanResidual + this.sigmaN * result.sigma)
            lower.push(predicted + result.meanResidual - this.sigmaN * result.sigma)
          } else {
            upper.push(null)
            lower.push(null)
          }
        }
        this.sigmaBandsRef.value = { upper, lower }

        // Replace anomaly series
        if (this.hasAnomaly) {
          this.hasAnomaly = removeAnomalySeries(this.chart, this.uData, this.hasAnomaly, this.hasThreshold)
        }
        if (result.anomalies.length > 0) {
          this.hasAnomaly = addAnomalySeries(
            this.chart,
            this.uData,
            result.anomalies,
            this.hasThreshold,
          )
        }

        this.chart.redraw()
      }
    },

    goBackToUpload() {
      this.clearTrend()
      this.step = 1
    },

    async fetchLimits(metadata, itemName) {
      if (!metadata || !metadata.TARGET || !metadata.PACKET || !itemName) return
      try {
        const api = new OpenC3Api()
        const details = await api.exec('get_item', [metadata.TARGET, metadata.PACKET, itemName], {}, { 'Ignore-Errors': '500' })
        if (details && details.limits) {
          for (const [, value] of Object.entries(details.limits)) {
            if (value && Object.keys(value).includes('red_low')) {
              const vals = [value.red_low, value.yellow_low, value.yellow_high, value.red_high]
              if (value.green_low != null && value.green_high != null) {
                vals.push(value.green_low, value.green_high)
              }
              this.limitsValues = vals
              return
            }
          }
        }
      } catch (_) {
        // No limits available — that's fine
      }
    },

    destroyChart() {
      if (this.chart) {
        this.chart.destroy()
        this.chart = null
        this.uData = null
      }
    },

    exportChartPng() {
      if (!this.chart) return
      const srcCanvas = this.chart.root.querySelector('canvas')
      if (!srcCanvas) return
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = srcCanvas.width
      exportCanvas.height = srcCanvas.height
      const ctx = exportCanvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
      ctx.drawImage(srcCanvas, 0, 0)
      const link = document.createElement('a')
      link.download = 'trend-chart.png'
      link.href = exportCanvas.toDataURL('image/png')
      link.click()
    },

    exportTrendCsv() {
      if (!this.parsedData || !this.headerRow) return
      const target = this.csvMetadata?.TARGET ?? ''
      const packet = this.csvMetadata?.PACKET ?? ''
      const itemName = this.selectedColumn || this.headerRow[1]
      const colIdx = this.headerRow.indexOf(itemName)
      if (colIdx < 1) return

      // Build a map of trend points keyed by timestamp
      const trendMap = new Map()
      if (this.activeTrend && this.activeTrend.points) {
        for (const [t, v] of this.activeTrend.points) {
          trendMap.set(t, v)
        }
      }

      // Collect all timestamps (original data + any future trend-only points)
      const timestamps = new Set(this.parsedData.map((row) => row[0]))
      for (const t of trendMap.keys()) {
        timestamps.add(t)
      }
      const sorted = [...timestamps].sort((a, b) => a - b)

      // Build a map of original data keyed by timestamp
      const dataMap = new Map()
      for (const row of this.parsedData) {
        dataMap.set(row[0], row[colIdx])
      }

      const rows = [['Timestamp', target, packet, itemName, `${itemName}_TREND`]]
      for (const t of sorted) {
        const ts = new Date(t * 1000).toISOString()
        const val = dataMap.has(t) ? dataMap.get(t) : ''
        const trend = trendMap.has(t) ? trendMap.get(t) : ''
        rows.push([ts, target, packet, val, trend])
      }

      const csv = rows.map((r) => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const link = document.createElement('a')
      link.download = 'trend-data.csv'
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
    },

    capitalize(str) {
      return trendLabel(str || '')
    },
  },
}
</script>

<style lang="scss" scoped>
.stepper {
  background-color: var(--color-background-base-default) !important;
}
.content-area {
  overflow-y: auto;
}
</style>

<style lang="scss">
#openc3-menu .app-title {
  font-size: 2rem;
}
</style>
