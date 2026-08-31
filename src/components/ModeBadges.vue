<script setup lang="ts">
import { useGameStore } from '../stores/game'
import type { TransportMode } from '../types/game'

defineProps<{ modes: TransportMode[] }>()
const store = useGameStore()
</script>

<template>
  <span class="badges">
    <span
      v-for="mode in modes"
      :key="mode"
      class="badge"
      :style="{ '--badge': store.config?.modes[mode]?.color ?? '#475569' }"
    >
      {{ store.config?.modes[mode]?.label ?? mode }}
    </span>
  </span>
</template>

<style scoped>
.badges {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  color: var(--badge);
  background: color-mix(in srgb, var(--badge) 14%, transparent);
}
</style>
