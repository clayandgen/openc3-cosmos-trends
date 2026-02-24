<template>
  <div class="step-content">
    <div class="d-flex align-center mb-3">
      <v-btn variant="text" size="small" @click="$emit('back')">
        <v-icon start>mdi-arrow-left</v-icon>
        Load Different Data
      </v-btn>
    </div>

    <v-row>
      <v-col cols="12" md="3">
        <div v-if="csvMetadata" class="d-flex flex-wrap ga-1 mb-3">
          <v-chip
            v-for="(value, key) in csvMetadata"
            :key="key"
            size="small"
            variant="elevated"
            color="primary"
          >
            {{ key }}: {{ value }}
          </v-chip>
        </div>
        <v-card variant="outlined">
          <v-card-title class="text-subtitle-1">Trend Settings</v-card-title>
          <v-card-text>
            <v-select
              v-if="dataColumns.length > 1"
              :model-value="selectedColumn"
              :items="dataColumns"
              label="Data Column"
              density="comfortable"
              hide-details
              class="mb-4"
              @update:model-value="$emit('update:selectedColumn', $event)"
            />
            <v-select
              :model-value="trendType"
              :items="trendTypes"
              label="Trend Type"
              density="comfortable"
              hide-details
              class="mb-1"
              :menu-props="{ maxHeight: 500 }"
              @update:model-value="$emit('update:trendType', $event)"
            />
            <div class="text-caption mb-3" style="opacity: 0.7">
              {{ trendDescription }}
            </div>
            <v-text-field
              v-if="trendType === 'polynomial'"
              :model-value="polyOrder"
              type="text"
              inputmode="numeric"
              label="Polynomial Order"
              density="comfortable"
              hide-details
              class="mb-4"
              @update:model-value="onPolyOrderInput"
            />
            <div class="d-flex ga-2 mb-4">
              <v-text-field
                :model-value="horizonValue"
                type="text"
                inputmode="numeric"
                label="Predict ahead"
                density="comfortable"
                hide-details
                style="flex: 1"
                @update:model-value="onHorizonInput"
              />
              <v-select
                v-model="horizonUnit"
                :items="horizonUnits"
                density="comfortable"
                hide-details
                style="flex: 0 0 120px"
              />
            </div>
            <v-text-field
              :model-value="threshold"
              label="Threshold"
              density="comfortable"
              hide-details
              clearable
              class="mb-4"
              @update:model-value="$emit('update:threshold', $event != null && $event !== '' && !isNaN(Number($event)) ? Number($event) : null)"
              @click:clear="$emit('update:threshold', null)"
            />
            <v-btn color="primary" block @click="$emit('calculate')">
              <v-icon start>mdi-trending-up</v-icon>
              Calculate
            </v-btn>
            <v-btn
              v-if="activeTrend"
              variant="outlined"
              block
              class="mt-2"
              @click="$emit('clear')"
            >
              Clear Trend
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Results card -->
        <v-card v-if="activeTrend" variant="tonal" class="mt-3">
            <v-card-title class="text-subtitle-1">Results</v-card-title>
            <v-card-text>
              <div class="d-flex align-center text-overline">
                R² (Goodness of Fit)
                <v-tooltip location="right" max-width="300">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="small" class="ml-1">mdi-information-outline</v-icon>
                  </template>
                  A value between 0 and 1 that indicates how well the trend line fits your data. 1.0 means a perfect fit, 0.0 means no relationship. Values above 0.9 are generally considered a good fit.
                </v-tooltip>
              </div>
              <div class="text-h5 mb-1" :class="r2Color">
                {{
                  activeTrend.r2 != null ? activeTrend.r2.toFixed(4) : 'N/A'
                }}
              </div>
              <div class="text-caption mb-3">{{ r2Interpretation }}</div>

              <div class="d-flex align-center text-overline">
                RMSE
                <v-tooltip location="right" max-width="300">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="small" class="ml-1">mdi-information-outline</v-icon>
                  </template>
                  Root Mean Square Error — the average distance between each data point and the trend line, in the same units as your data. Lower values mean the trend line is closer to the actual data.
                </v-tooltip>
              </div>
              <div class="text-h6 mb-3">
                {{
                  activeTrend.rmse != null
                    ? activeTrend.rmse.toFixed(4)
                    : 'N/A'
                }}
              </div>

              <div v-if="thresholdCrossing" class="mb-3">
                <div class="d-flex align-center text-overline">
                  Trend Line Threshold Crossing
                  <v-tooltip location="right" max-width="300">
                    <template #activator="{ props }">
                      <v-icon v-bind="props" size="small" class="ml-1">mdi-information-outline</v-icon>
                    </template>
                    The estimated time when the predicted trend will reach the threshold value, based on interpolation between prediction points.
                  </v-tooltip>
                </div>
                <div class="text-h6" :class="thresholdCrossing.inFuture ? 'text-orange' : 'text-white'">
                  {{ thresholdCrossing.label }}
                </div>
              </div>
              <div v-else-if="threshold != null && activeTrend" class="mb-3">
                <div class="text-overline">Threshold Crossing</div>
                <div class="text-caption" style="opacity: 0.7">Trend does not reach threshold within the prediction range.</div>
              </div>

              <div v-if="activeTrend.equation" class="text-overline">
                Equation
              </div>
              <code v-if="activeTrend.equation" class="text-caption">
                {{ activeTrend.equation }}
              </code>
            </v-card-text>
          </v-card>
      </v-col>

      <v-col cols="12" md="9">
        <div ref="chartContainer" class="chart-box"></div>
      </v-col>
    </v-row>
  </div>
</template>

<script>
import { TREND_TYPES, trendLabel } from '../../lib/trendEngine'

export default {
  props: {
    dataColumns: { type: Array, default: () => [] },
    csvMetadata: { type: Object, default: null },
    selectedColumn: { type: String, default: null },
    trendType: { type: String, default: 'linear' },
    polyOrder: { type: Number, default: 2 },
    horizonSec: { type: Number, default: 43200 },
    activeTrend: { type: Object, default: null },
    threshold: { type: Number, default: null },
    timeZone: { type: String, default: 'local' },
  },
  emits: [
    'back',
    'calculate',
    'clear',
    'update:selectedColumn',
    'update:trendType',
    'update:polyOrder',
    'update:horizonSec',
    'update:threshold',
  ],
  data() {
    const unitMultipliers = { Seconds: 1, Minutes: 60, Hours: 3600, Days: 86400 }
    const defaultUnit = 'Hours'
    return {
      trendTypes: TREND_TYPES.map((t) => {
        return {
          title: trendLabel(t),
          value: t,
        }
      }),
      horizonUnits: Object.keys(unitMultipliers),
      unitMultipliers,
      horizonUnit: defaultUnit,
      horizonValue: this.horizonSec / unitMultipliers[defaultUnit],
    }
  },
  watch: {
    horizonValue() {
      this.emitHorizonSec()
    },
    horizonUnit() {
      this.emitHorizonSec()
    },
  },
  computed: {
    trendDescription() {
      const descriptions = {
        linear: 'Straight line fit (y = mx + b). Best for data with a constant rate of change.',
        polynomial: 'Curved fit using powers of x. Good for data that bends or has turning points.',
        exponential: 'Rapid growth or decay (y = a\u00B7e^(bx)). Best for data that accelerates over time.',
        logarithmic: 'Fast initial change that levels off (y = a + b\u00B7ln(x)). Good for diminishing returns.',
        power: 'Scaling relationship (y = a\u00B7x^b). Common in physical systems and proportional relationships.',
        sinusoidal: 'Periodic wave fit (y = A\u00B7sin(Bx+C)+D). Best for cyclic or oscillating data.',
      }
      return descriptions[this.trendType] || ''
    },
    r2Color() {
      if (!this.activeTrend || this.activeTrend.r2 == null) return ''
      if (this.activeTrend.r2 >= 0.9) return 'text-green'
      if (this.activeTrend.r2 >= 0.7) return 'text-yellow'
      return 'text-red'
    },
    r2Interpretation() {
      if (!this.activeTrend || this.activeTrend.r2 == null) return ''
      if (this.activeTrend.r2 >= 0.95) return 'Excellent fit'
      if (this.activeTrend.r2 >= 0.9) return 'Good fit'
      if (this.activeTrend.r2 >= 0.7) return 'Moderate fit'
      if (this.activeTrend.r2 >= 0.5) return 'Weak fit'
      return 'Poor fit — try a different trend type'
    },
    thresholdCrossing() {
      if (this.threshold == null || !this.activeTrend || !this.activeTrend.points) return null
      const pts = this.activeTrend.points
      const thr = this.threshold
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1]
        const [x1, y1] = pts[i]
        // Check if threshold is crossed between these two points
        if ((y0 <= thr && y1 >= thr) || (y0 >= thr && y1 <= thr)) {
          // Linear interpolation to find crossing timestamp
          const frac = (thr - y0) / (y1 - y0)
          const crossTs = x0 + frac * (x1 - x0)
          const date = new Date(crossTs * 1000)
          // Determine if crossing is in the future portion
          const inFuture = crossTs > pts[pts.length - 1][0]
          let label
          if (this.timeZone === 'utc') {
            label = date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
          } else {
            const y = date.getFullYear()
            const m = String(date.getMonth() + 1).padStart(2, '0')
            const d = String(date.getDate()).padStart(2, '0')
            const hrs = String(date.getHours()).padStart(2, '0')
            const min = String(date.getMinutes()).padStart(2, '0')
            const sec = String(date.getSeconds()).padStart(2, '0')
            label = `${y}-${m}-${d} ${hrs}:${min}:${sec}`
          }
          return {
            label,
            inFuture,
          }
        }
      }
      return null
    },
  },
  methods: {
    onHorizonInput(val) {
      const num = Number(val)
      if (isNaN(num)) return
      this.horizonValue = Math.max(0, num)
    },
    onPolyOrderInput(val) {
      const num = Math.round(Number(val))
      if (isNaN(num)) return
      this.$emit('update:polyOrder', Math.min(10, Math.max(1, num)))
    },
    emitHorizonSec() {
      const multiplier = this.unitMultipliers[this.horizonUnit] || 1
      this.$emit('update:horizonSec', (this.horizonValue || 0) * multiplier)
    },
    getContainer() {
      return this.$refs.chartContainer
    },
  },
}
</script>

<style scoped>
.chart-box {
  width: 100%;
  min-height: 60vh;
}
</style>
