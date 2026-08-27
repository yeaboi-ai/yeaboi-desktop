import type { EdgeTypes } from '@xyflow/react';
import { SolidEdge } from './SolidEdge';
import { DashedEdge } from './DashedEdge';
import { AnimatedEdge } from './AnimatedEdge';
import { RelationshipEdge } from './RelationshipEdge';
import { StepEdge } from './StepEdge';

export const edgeTypes: EdgeTypes = {
  solid: SolidEdge,
  dashed: DashedEdge,
  animated: AnimatedEdge,
  relationship: RelationshipEdge,
  step: StepEdge,
};

export { SolidEdge, DashedEdge, AnimatedEdge, RelationshipEdge, StepEdge };
