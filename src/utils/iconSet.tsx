/**
 * Icon Set Utility
 * 
 * Provides a comprehensive set of icons from lucide-react for use in visualization presets.
 * Icons are organized by category for easier browsing.
 */

import React from 'react';
import {
  // Nature & Elements
  Flame, Flower, Leaf, TreePine, Mountain, Waves, Droplet, Sparkles, Sun, Moon, Cloud,
  // Music & Audio
  Music, Music2, Radio, Headphones, Volume2, Disc,
  // Tech & Media
  Monitor, Tv, Smartphone, Camera, Video, Film, Image, Play, Pause, SkipForward,
  // Shapes & Abstract
  Circle, Square, Triangle, Hexagon, Star, Heart, Zap, Target, Compass,
  // Objects
  Lightbulb, Gem, Crown, Trophy, Award, Gift, Box, Package,
  // Movement & Direction
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Move, Navigation,
  // Symbols
  Infinity as InfinityIcon, Atom, Brain, Eye, EyeOff, Lock, Unlock, Key,
  // Other
  Settings, Settings2, Sliders, Palette, Paintbrush, Brush, Wand2,
} from 'lucide-react';

export type IconName = 
  | 'Flame' | 'Flower' | 'Leaf' | 'TreePine' | 'Mountain' | 'Waves' | 'Droplet' | 'Sparkles' | 'Sun' | 'Moon' | 'Cloud'
  | 'Music' | 'Music2' | 'Radio' | 'Headphones' | 'Volume2' | 'Disc'
  | 'Monitor' | 'Tv' | 'Smartphone' | 'Camera' | 'Video' | 'Film' | 'Image' | 'Play' | 'Pause' | 'SkipForward'
  | 'Circle' | 'Square' | 'Triangle' | 'Hexagon' | 'Star' | 'Heart' | 'Zap' | 'Target' | 'Compass'
  | 'Lightbulb' | 'Gem' | 'Crown' | 'Trophy' | 'Award' | 'Gift' | 'Box' | 'Package'
  | 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown' | 'Move' | 'Navigation'
  | 'Infinity' | 'Atom' | 'Brain' | 'Eye' | 'EyeOff' | 'Lock' | 'Unlock' | 'Key'
  | 'Settings' | 'Settings2' | 'Sliders' | 'Palette' | 'Paintbrush' | 'Brush' | 'Wand2';

export interface IconOption {
  name: IconName;
  label: string;
  category: string;
  component: React.ComponentType<{ size?: number; className?: string }>;
}

const iconMap: Record<IconName, React.ComponentType<{ size?: number; className?: string }>> = {
  // Nature & Elements
  Flame, Flower, Leaf, TreePine, Mountain, Waves, Droplet, Sparkles, Sun, Moon, Cloud,
  // Music & Audio
  Music, Music2, Radio, Headphones, Volume2, Disc,
  // Tech & Media
  Monitor, Tv, Smartphone, Camera, Video, Film, Image, Play, Pause, SkipForward,
  // Shapes & Abstract
  Circle, Square, Triangle, Hexagon, Star, Heart, Zap, Target, Compass,
  // Objects
  Lightbulb, Gem, Crown, Trophy, Award, Gift, Box, Package,
  // Movement & Direction
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Move, Navigation,
  // Symbols
  Infinity: InfinityIcon, Atom, Brain, Eye, EyeOff, Lock, Unlock, Key,
  // Other
  Settings, Settings2, Sliders, Palette, Paintbrush, Brush, Wand2,
};

export const iconOptions: IconOption[] = [
  // Nature & Elements
  { name: 'Flame', label: 'Flame', category: 'Nature & Elements', component: Flame },
  { name: 'Flower', label: 'Flower', category: 'Nature & Elements', component: Flower },
  { name: 'Leaf', label: 'Leaf', category: 'Nature & Elements', component: Leaf },
  { name: 'TreePine', label: 'Tree', category: 'Nature & Elements', component: TreePine },
  { name: 'Mountain', label: 'Mountain', category: 'Nature & Elements', component: Mountain },
  { name: 'Waves', label: 'Waves', category: 'Nature & Elements', component: Waves },
  { name: 'Droplet', label: 'Droplet', category: 'Nature & Elements', component: Droplet },
  { name: 'Sparkles', label: 'Sparkles', category: 'Nature & Elements', component: Sparkles },
  { name: 'Sun', label: 'Sun', category: 'Nature & Elements', component: Sun },
  { name: 'Moon', label: 'Moon', category: 'Nature & Elements', component: Moon },
  { name: 'Cloud', label: 'Cloud', category: 'Nature & Elements', component: Cloud },
  
  // Music & Audio
  { name: 'Music', label: 'Music', category: 'Music & Audio', component: Music },
  { name: 'Music2', label: 'Music 2', category: 'Music & Audio', component: Music2 },
  { name: 'Radio', label: 'Radio', category: 'Music & Audio', component: Radio },
  { name: 'Headphones', label: 'Headphones', category: 'Music & Audio', component: Headphones },
  { name: 'Volume2', label: 'Volume', category: 'Music & Audio', component: Volume2 },
  { name: 'Disc', label: 'Disc', category: 'Music & Audio', component: Disc },
  
  // Tech & Media
  { name: 'Monitor', label: 'Monitor', category: 'Tech & Media', component: Monitor },
  { name: 'Tv', label: 'TV', category: 'Tech & Media', component: Tv },
  { name: 'Smartphone', label: 'Smartphone', category: 'Tech & Media', component: Smartphone },
  { name: 'Camera', label: 'Camera', category: 'Tech & Media', component: Camera },
  { name: 'Video', label: 'Video', category: 'Tech & Media', component: Video },
  { name: 'Film', label: 'Film', category: 'Tech & Media', component: Film },
  { name: 'Image', label: 'Image', category: 'Tech & Media', component: Image },
  { name: 'Play', label: 'Play', category: 'Tech & Media', component: Play },
  { name: 'Pause', label: 'Pause', category: 'Tech & Media', component: Pause },
  { name: 'SkipForward', label: 'Skip Forward', category: 'Tech & Media', component: SkipForward },
  
  // Shapes & Abstract
  { name: 'Circle', label: 'Circle', category: 'Shapes & Abstract', component: Circle },
  { name: 'Square', label: 'Square', category: 'Shapes & Abstract', component: Square },
  { name: 'Triangle', label: 'Triangle', category: 'Shapes & Abstract', component: Triangle },
  { name: 'Hexagon', label: 'Hexagon', category: 'Shapes & Abstract', component: Hexagon },
  { name: 'Star', label: 'Star', category: 'Shapes & Abstract', component: Star },
  { name: 'Heart', label: 'Heart', category: 'Shapes & Abstract', component: Heart },
  { name: 'Zap', label: 'Zap', category: 'Shapes & Abstract', component: Zap },
  { name: 'Target', label: 'Target', category: 'Shapes & Abstract', component: Target },
  { name: 'Compass', label: 'Compass', category: 'Shapes & Abstract', component: Compass },
  
  // Objects
  { name: 'Lightbulb', label: 'Lightbulb', category: 'Objects', component: Lightbulb },
  { name: 'Gem', label: 'Gem', category: 'Objects', component: Gem },
  { name: 'Crown', label: 'Crown', category: 'Objects', component: Crown },
  { name: 'Trophy', label: 'Trophy', category: 'Objects', component: Trophy },
  { name: 'Award', label: 'Award', category: 'Objects', component: Award },
  { name: 'Gift', label: 'Gift', category: 'Objects', component: Gift },
  { name: 'Box', label: 'Box', category: 'Objects', component: Box },
  { name: 'Package', label: 'Package', category: 'Objects', component: Package },
  
  // Movement & Direction
  { name: 'ArrowRight', label: 'Arrow Right', category: 'Movement & Direction', component: ArrowRight },
  { name: 'ArrowLeft', label: 'Arrow Left', category: 'Movement & Direction', component: ArrowLeft },
  { name: 'ArrowUp', label: 'Arrow Up', category: 'Movement & Direction', component: ArrowUp },
  { name: 'ArrowDown', label: 'Arrow Down', category: 'Movement & Direction', component: ArrowDown },
  { name: 'Move', label: 'Move', category: 'Movement & Direction', component: Move },
  { name: 'Navigation', label: 'Navigation', category: 'Movement & Direction', component: Navigation },
  
  // Symbols
  { name: 'Infinity', label: 'Infinity', category: 'Symbols', component: InfinityIcon },
  { name: 'Atom', label: 'Atom', category: 'Symbols', component: Atom },
  { name: 'Brain', label: 'Brain', category: 'Symbols', component: Brain },
  { name: 'Eye', label: 'Eye', category: 'Symbols', component: Eye },
  { name: 'EyeOff', label: 'Eye Off', category: 'Symbols', component: EyeOff },
  { name: 'Lock', label: 'Lock', category: 'Symbols', component: Lock },
  { name: 'Unlock', label: 'Unlock', category: 'Symbols', component: Unlock },
  { name: 'Key', label: 'Key', category: 'Symbols', component: Key },
  
  // Other
  { name: 'Settings', label: 'Settings', category: 'Other', component: Settings },
  { name: 'Settings2', label: 'Settings 2', category: 'Other', component: Settings2 },
  { name: 'Sliders', label: 'Sliders', category: 'Other', component: Sliders },
  { name: 'Palette', label: 'Palette', category: 'Other', component: Palette },
  { name: 'Paintbrush', label: 'Paintbrush', category: 'Other', component: Paintbrush },
  { name: 'Brush', label: 'Brush', category: 'Other', component: Brush },
  { name: 'Wand2', label: 'Wand', category: 'Other', component: Wand2 },
];

/**
 * Get an icon component by name
 */
export function getIcon(name: IconName | string | undefined, size: number = 32): React.ReactNode {
  if (!name) return null;
  const IconComponent = iconMap[name as IconName];
  if (!IconComponent) return null;
  return <IconComponent size={size} />;
}

/**
 * Get icon options grouped by category
 */
export function getIconsByCategory(): Record<string, IconOption[]> {
  const grouped: Record<string, IconOption[]> = {};
  iconOptions.forEach(icon => {
    if (!grouped[icon.category]) {
      grouped[icon.category] = [];
    }
    grouped[icon.category].push(icon);
  });
  return grouped;
}

