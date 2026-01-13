import { getBooleanSetting } from '../../utils/settings';

// ============================================================================
// Types
// ============================================================================

export type TransitionType = 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 
                      'zoomIn' | 'zoomOut' | 'rotate3DX' | 'rotate3DY' | 'cube' | 'flip';

export interface TransitionStyle {
  opacity?: number;
  transform?: string;
  transformOrigin?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getAvailableTransitions(settings: Record<string, unknown>): TransitionType[] {
  const transitions: TransitionType[] = [];
  
  if (getBooleanSetting(settings.enableFade, true)) {
    transitions.push('fade');
  }
  if (getBooleanSetting(settings.enableSlide, true)) {
    transitions.push('slideLeft', 'slideRight', 'slideUp', 'slideDown');
  }
  if (getBooleanSetting(settings.enableZoom, true)) {
    transitions.push('zoomIn', 'zoomOut');
  }
  if (getBooleanSetting(settings.enable3DRotate, true)) {
    transitions.push('rotate3DX', 'rotate3DY');
  }
  if (getBooleanSetting(settings.enableCube, true)) {
    transitions.push('cube');
  }
  if (getBooleanSetting(settings.enableFlip, true)) {
    transitions.push('flip');
  }
  
  return transitions.length > 0 ? transitions : ['fade'];
}

export function getTransitionStyles(
  transition: TransitionType,
  phase: 'enter' | 'active' | 'exit'
): TransitionStyle {
  const styles: Record<TransitionType, Record<string, TransitionStyle>> = {
    fade: {
      enter: { opacity: 0 },
      active: { opacity: 1 },
      exit: { opacity: 0 }
    },
    // Symmetric slides: exit left → enter from right
    slideLeft: {
      enter: { transform: 'translateX(100%)', opacity: 1 },  // Enter from right
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(-100%)', opacity: 1 }   // Exit to left
    },
    // Symmetric slides: exit right → enter from left
    slideRight: {
      enter: { transform: 'translateX(-100%)', opacity: 1 }, // Enter from left
      active: { transform: 'translateX(0)', opacity: 1 },
      exit: { transform: 'translateX(100%)', opacity: 1 }    // Exit to right
    },
    // Symmetric slides: exit up → enter from bottom
    slideUp: {
      enter: { transform: 'translateY(100%)', opacity: 1 },  // Enter from bottom
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(-100%)', opacity: 1 }   // Exit to top
    },
    // Symmetric slides: exit down → enter from top
    slideDown: {
      enter: { transform: 'translateY(-100%)', opacity: 1 }, // Enter from top
      active: { transform: 'translateY(0)', opacity: 1 },
      exit: { transform: 'translateY(100%)', opacity: 1 }    // Exit to bottom
    },
    zoomIn: {
      enter: { transform: 'scale(0.8)', opacity: 0 },
      active: { transform: 'scale(1)', opacity: 1 },
      exit: { transform: 'scale(1.2)', opacity: 0 }
    },
    zoomOut: {
      enter: { transform: 'scale(1.2)', opacity: 0 },
      active: { transform: 'scale(1)', opacity: 1 },
      exit: { transform: 'scale(0.8)', opacity: 0 }
    },
    rotate3DX: {
      enter: { transform: 'perspective(1000px) rotateX(90deg) translateZ(100px)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateX(0deg) translateZ(0)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateX(-90deg) translateZ(100px)', opacity: 0 }
    },
    rotate3DY: {
      enter: { transform: 'perspective(1000px) rotateY(-90deg) translateZ(100px)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateY(0deg) translateZ(0)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateY(90deg) translateZ(100px)', opacity: 0 }
    },
    cube: {
      // Improved Cube transition using rotate and translate to simulate a rotating volume
      enter: { transform: 'perspective(2000px) rotateY(90deg) translateZ(50vw)', opacity: 0, transformOrigin: 'center center -50vw' },
      active: { transform: 'perspective(2000px) rotateY(0deg) translateZ(0)', opacity: 1, transformOrigin: 'center center 0' },
      exit: { transform: 'perspective(2000px) rotateY(-90deg) translateZ(50vw)', opacity: 0, transformOrigin: 'center center -50vw' }
    },
    flip: {
      enter: { transform: 'perspective(1000px) rotateY(180deg)', opacity: 0 },
      active: { transform: 'perspective(1000px) rotateY(0deg)', opacity: 1 },
      exit: { transform: 'perspective(1000px) rotateY(-180deg)', opacity: 0 }
    }
  };
  
  return styles[transition][phase];
}
