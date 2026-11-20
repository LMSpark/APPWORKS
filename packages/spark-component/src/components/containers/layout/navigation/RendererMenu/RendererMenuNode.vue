<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererMenu/RendererMenuNode
职责：递归渲染 RendererMenu 的单个菜单项、子菜单或分组。
边界：只负责呈现与把选择回传给 RendererMenu；不判定激活或导航。
-->
<template>
  <el-sub-menu v-if="hasChildren && !item.group" :index="item.index" :disabled="item.disabled" :class="itemClass">
    <template #title>
      <span class="r-menu__label" :class="{'r-menu__label--selectable': item.titleSelectable}" @click="selectTitle">
        <DisplayIcon v-if="item.icon" :icon="item.icon" class="r-menu__icon" />
        <span v-if="showLabel" class="r-menu__text">{{ item.label }}</span>
        <span v-if="hasBadge" class="r-menu__badge">{{ item.badge }}</span>
      </span>
    </template>
    <RendererMenuNode
      v-for="child in item.children"
      :key="child.index"
      :item="child"
      :show-label="true"
      :nested="true"
      :separator="separator"
      @select="forward"
    />
  </el-sub-menu>

  <el-menu-item-group v-else-if="hasChildren" :title="showLabel ? item.label : ''">
    <RendererMenuNode
      v-for="child in item.children"
      :key="child.index"
      :item="child"
      :show-label="showLabel"
      :nested="nested"
      :separator="separator"
      @select="forward"
    />
  </el-menu-item-group>

  <template v-else>
    <el-menu-item
      :index="item.index"
      :disabled="item.disabled"
      :aria-current="item.current ? 'page' : undefined"
      :class="itemClass"
      @click="emit('select', item)"
    >
      <span class="r-menu__label">
        <DisplayIcon v-if="item.icon" :icon="item.icon" class="r-menu__icon" />
        <span v-if="showLabel" class="r-menu__text">{{ item.label }}</span>
        <span v-if="hasBadge" class="r-menu__badge">{{ item.badge }}</span>
      </span>
    </el-menu-item>
    <li v-if="separator && item.dividerAfter" class="r-menu__separator" role="separator" aria-hidden="true" />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DisplayIcon from '../../../../display/non-data-components/DisplayIcon/DisplayIcon.vue'
import type { MenuItem } from './RendererMenu.props'

defineOptions({ name: 'RendererMenuNode' })

/** showLabel 控制文本显示（纵向折叠时顶层隐藏）；nested 表示位于子菜单弹层内；separator 为 true 时以独立分隔行呈现 dividerAfter。 */
const props = defineProps<{ item: MenuItem; showLabel: boolean; nested: boolean; separator: boolean }>()
const emit = defineEmits<{ select: [item: MenuItem] }>()

const hasChildren = computed(() => (props.item.children?.length ?? 0) > 0)
const hasBadge = computed(() => props.item.badge !== undefined && props.item.badge !== '' && props.item.badge !== 0)
const itemClass = computed(() => ({
  'r-menu__item': true,
  'r-menu__item--active': props.item.active === true,
  'r-menu__item--disabled': props.item.disabled === true,
  'r-menu__item--divider-after': props.item.dividerAfter === true,
  'r-menu__item--has-children': hasChildren.value,
  'r-menu__item--nested': props.nested,
}))

function selectTitle(event: MouseEvent): void {
  if (!props.item.titleSelectable || props.item.disabled) return
  event.stopPropagation()
  emit('select', props.item)
}

function forward(item: MenuItem): void {
  emit('select', item)
}
</script>
