<template>
  <div class="step-content">
    <v-card variant="outlined" class="mx-auto" max-width="700">
      <v-card-title>Load Telemetry Data</v-card-title>
      <v-card-subtitle>
        Upload a CSV from Data Extractor, or fetch data directly from the API.
      </v-card-subtitle>
      <v-card-text>
        <v-tabs v-model="tab" class="mb-4" slider-color="white" selected-class="active-tab">
          <v-tab value="api" color="white">
            <v-icon start>mdi-cloud-download</v-icon>
            Telemetry API
          </v-tab>
          <v-tab value="csv" color="white">
            <v-icon start>mdi-file-delimited</v-icon>
            Upload CSV
          </v-tab>
        </v-tabs>

        <!-- CSV Upload Tab -->
        <div v-show="tab === 'csv'">
          <v-file-input
            v-model="csvFile"
            accept=".csv"
            label="Choose CSV file"
            prepend-icon="mdi-file-delimited"
            show-size
            @update:model-value="onFileSelected"
          />
          <v-alert v-if="parseError" type="error" class="mt-2" density="compact">
            {{ parseError }}
          </v-alert>
        </div>

        <!-- API Fetch Tab -->
        <div v-show="tab === 'api'">
          <target-packet-item-chooser
            choose-item
            @on-set="onTpiSet"
          />
          <v-row class="mt-2" dense>
            <v-col cols="6">
              <v-text-field
                v-model="startDateTime"
                label="Start Date/Time"
                type="datetime-local"
                density="comfortable"
                :step="1"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="endDateTime"
                label="End Date/Time"
                type="datetime-local"
                density="comfortable"
                :step="1"
                hide-details
              />
            </v-col>
          </v-row>
          <v-btn
            color="primary"
            class="mt-4"
            :disabled="!canFetch"
            :loading="fetching"
            block
            @click="fetchFromApi"
          >
            <v-icon start>mdi-download</v-icon>
            Fetch Data
          </v-btn>
          <v-alert v-if="fetchError" type="error" class="mt-2" density="compact">
            {{ fetchError }}
          </v-alert>
        </div>

        <!-- Parsed data summary (shared between both tabs) -->
        <v-card v-if="parsed" variant="tonal" class="mt-3">
          <v-card-text class="py-2">
            <div class="d-flex flex-wrap align-center ga-2">
              <v-chip
                v-for="(value, key) in parsed.metadata"
                :key="key"
                size="small"
                variant="elevated"
                color="primary"
              >
                {{ key }}: {{ value }}
              </v-chip>
              <v-chip
                v-for="col in parsed.dataColumns"
                :key="col"
                size="small"
                variant="elevated"
                color="primary"
              >
                ITEM: {{ col }}
              </v-chip>
              <v-spacer />
              <span class="text-caption">
                {{ parsed.rowCount }} data points
              </span>
            </div>
          </v-card-text>
        </v-card>
        <v-alert
          v-else-if="!fetching"
          variant="tonal"
          density="compact"
          class="mt-3"
          color="primary"
          style="color: white !important"
        >
          <template v-if="tab === 'csv'">
            CSV must have a header row. First column must be a timestamp. The
            remaining columns are treated as data series. Typically exported
            from the Data Extractor tool.
          </template>
          <template v-else>
            Select a Target, Packet, and Item, then choose a time range to
            fetch historical telemetry data.
          </template>
        </v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn
          color="primary"
          size="large"
          :disabled="!parsed"
          style="color: white !important"
          @click="$emit('next')"
        >
          Review Data
          <v-icon end>mdi-arrow-right</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script>
import { parseCSV } from '../../lib/csvParser'
import { Cable } from '@openc3/js-common/services'
import { TargetPacketItemChooser } from '@openc3/vue-common/components'

export default {
  components: { TargetPacketItemChooser },
  emits: ['parsed', 'next'],
  data() {
    return {
      tab: 'api',
      // CSV state
      csvFile: null,
      parseError: null,
      parsed: null,
      // API state
      targetName: null,
      packetName: null,
      itemName: null,
      startDateTime: '',
      endDateTime: '',
      fetching: false,
      fetchError: null,
      cable: null,
      subscription: null,
    }
  },
  computed: {
    canFetch() {
      return (
        this.targetName &&
        this.packetName &&
        this.itemName &&
        this.startDateTime &&
        this.endDateTime &&
        !this.fetching
      )
    },
  },
  created() {
    // Default to the last hour
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    this.endDateTime = this.toLocalDateTimeString(now)
    this.startDateTime = this.toLocalDateTimeString(oneHourAgo)
  },
  beforeUnmount() {
    this.disconnectCable()
  },
  methods: {
    toLocalDateTimeString(date) {
      // Format as YYYY-MM-DDTHH:mm:ss for datetime-local input
      const pad = (n) => String(n).padStart(2, '0')
      return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
      )
    },
    onTpiSet(item) {
      this.targetName = item.targetName
      this.packetName = item.packetName
      this.itemName = item.itemName
    },
    emitResult(result) {
      this.parsed = {
        metadata: result.metadata,
        dataColumns: result.headerRow.slice(1),
        rowCount: result.data.length,
      }
      this.$emit('parsed', result)
    },
    onFileSelected(file) {
      this.parseError = null
      this.parsed = null
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          this.emitResult(parseCSV(e.target.result))
        } catch (err) {
          this.parseError = err.message
        }
      }
      reader.readAsText(file)
    },
    disconnectCable() {
      if (this.cable) {
        this.cable.disconnect()
        this.cable = null
        this.subscription = null
      }
    },
    async fetchFromApi() {
      this.fetchError = null
      this.parsed = null
      this.fetching = true
      this.disconnectCable()

      const startNs =
        new Date(this.startDateTime).getTime() * 1_000_000
      const endNs =
        new Date(this.endDateTime).getTime() * 1_000_000

      if (startNs >= endNs) {
        this.fetchError = 'Start time must be before end time.'
        this.fetching = false
        return
      }

      const itemKey = `DECOM__TLM__${this.targetName}__${this.packetName}__${this.itemName}__CONVERTED`
      const itemLabel = this.itemName
      const collectedRows = []

      try {
        this.cable = new Cable()
        this.subscription = await this.cable.createSubscription(
          'StreamingChannel',
          window.openc3Scope,
          {
            connected: () => {
              this.subscription.perform('add', {
                scope: window.openc3Scope,
                token: localStorage.openc3Token,
                items: [[itemKey, '0']],
                start_time: startNs,
                end_time: endNs,
              })
            },
            received: (data) => {
              if (data.length === 0) {
                // Stream complete
                this.onApiFetchComplete(collectedRows, itemLabel)
                return
              }
              for (const packet of data) {
                const timeMs = packet['__time'] / 1_000_000
                const timeSec = timeMs / 1000
                const value = packet['0']
                if (value != null && isFinite(value)) {
                  collectedRows.push([timeSec, Number(value)])
                }
              }
            },
            disconnected: () => {
              if (this.fetching) {
                this.fetchError = 'Connection lost while fetching data.'
                this.fetching = false
              }
            },
          },
        )
      } catch (err) {
        this.fetchError = `Failed to connect: ${err.message || err}`
        this.fetching = false
        this.disconnectCable()
      }
    },
    onApiFetchComplete(rows, itemLabel) {
      this.fetching = false
      this.disconnectCable()

      if (rows.length < 2) {
        this.fetchError =
          'Not enough data points returned. Try a wider time range.'
        return
      }

      rows.sort((a, b) => a[0] - b[0])

      this.emitResult({
        headerRow: ['TIME', itemLabel],
        data: rows,
        metadata: {
          TARGET: this.targetName,
          PACKET: this.packetName,
        },
      })
    },
  },
}
</script>

<style scoped>
.active-tab {
  opacity: 1 !important;
}
</style>
