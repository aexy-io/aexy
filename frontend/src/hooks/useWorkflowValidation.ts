import { useState, useCallback, useEffect } from "react";
import { Node, Edge } from "@xyflow/react";

export interface ValidationError {
  nodeId: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Validation rules for different node types
const validateTriggerNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  if (!data.trigger_type) {
    errors.push({
      nodeId: node.id,
      field: "trigger_type",
      message: "Trigger type is required",
      severity: "error",
    });
  }

  // Scheduled trigger requires cron expression
  if (data.trigger_type === "scheduled" && !data.schedule) {
    errors.push({
      nodeId: node.id,
      field: "schedule",
      message: "Schedule is required for scheduled triggers",
      severity: "error",
    });
  }

  // Field changed trigger requires field selection
  if (data.trigger_type === "field_changed" && !data.field_slug) {
    errors.push({
      nodeId: node.id,
      field: "field_slug",
      message: "Field is required for field changed triggers",
      severity: "error",
    });
  }

  return errors;
};

const validateActionNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  if (!data.action_type) {
    errors.push({
      nodeId: node.id,
      field: "action_type",
      message: "Action type is required",
      severity: "error",
    });
    return errors;
  }

  // Email actions
  if (data.action_type === "send_email") {
    if (!data.to && !data.email_template_id) {
      errors.push({
        nodeId: node.id,
        field: "to",
        message: "Recipient is required",
        severity: "error",
      });
    }
    if (!data.subject && !data.email_template_id) {
      errors.push({
        nodeId: node.id,
        field: "subject",
        message: "Subject is required",
        severity: "error",
      });
    }
  }

  // Slack actions
  if (data.action_type === "send_slack") {
    if (!data.channel && !data.channel_id) {
      errors.push({
        nodeId: node.id,
        field: "channel",
        message: "Slack channel is required",
        severity: "error",
      });
    }
    if (!data.message_template) {
      errors.push({
        nodeId: node.id,
        field: "message_template",
        message: "Message is required",
        severity: "error",
      });
    }
  }

  // SMS actions
  if (data.action_type === "send_sms") {
    if (!data.phone_field && !data.to) {
      errors.push({
        nodeId: node.id,
        field: "phone_field",
        message: "Phone number field is required",
        severity: "error",
      });
    }
    if (!data.message_template) {
      errors.push({
        nodeId: node.id,
        field: "message_template",
        message: "Message is required",
        severity: "error",
      });
    }
  }

  // Webhook actions
  if (data.action_type === "webhook_call") {
    if (!data.webhook_url) {
      errors.push({
        nodeId: node.id,
        field: "webhook_url",
        message: "Webhook URL is required",
        severity: "error",
      });
    }
  }

  // Update record actions
  if (data.action_type === "update_record") {
    const fieldUpdates = data.field_updates as Array<{ field: string; value: string }> | undefined;
    if (!fieldUpdates || fieldUpdates.length === 0) {
      errors.push({
        nodeId: node.id,
        field: "field_updates",
        message: "At least one field update is required",
        severity: "error",
      });
    }
  }

  return errors;
};

const validateConditionNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  const conditions = data.conditions as Array<{ field: string; operator: string; value: string }> | undefined;

  if (!conditions || conditions.length === 0) {
    errors.push({
      nodeId: node.id,
      field: "conditions",
      message: "At least one condition is required",
      severity: "error",
    });
    return errors;
  }

  conditions.forEach((condition, index) => {
    if (!condition.field) {
      errors.push({
        nodeId: node.id,
        field: `conditions.${index}.field`,
        message: `Condition ${index + 1}: Field is required`,
        severity: "error",
      });
    }
    if (!condition.operator) {
      errors.push({
        nodeId: node.id,
        field: `conditions.${index}.operator`,
        message: `Condition ${index + 1}: Operator is required`,
        severity: "error",
      });
    }
    // Value is optional for is_empty/is_not_empty operators
    if (
      !condition.value &&
      condition.operator &&
      !["is_empty", "is_not_empty"].includes(condition.operator)
    ) {
      errors.push({
        nodeId: node.id,
        field: `conditions.${index}.value`,
        message: `Condition ${index + 1}: Value is required`,
        severity: "error",
      });
    }
  });

  return errors;
};

const validateWaitNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  if (!data.wait_type) {
    errors.push({
      nodeId: node.id,
      field: "wait_type",
      message: "Wait type is required",
      severity: "error",
    });
    return errors;
  }

  if (data.wait_type === "duration") {
    if (!data.duration_value || Number(data.duration_value) <= 0) {
      errors.push({
        nodeId: node.id,
        field: "duration_value",
        message: "Duration must be greater than 0",
        severity: "error",
      });
    }
    if (!data.duration_unit) {
      errors.push({
        nodeId: node.id,
        field: "duration_unit",
        message: "Duration unit is required",
        severity: "error",
      });
    }
  }

  if (data.wait_type === "datetime") {
    if (!data.wait_until) {
      errors.push({
        nodeId: node.id,
        field: "wait_until",
        message: "Date/time is required",
        severity: "error",
      });
    }
  }

  if (data.wait_type === "event") {
    if (!data.wait_for_event && !data.event_type) {
      errors.push({
        nodeId: node.id,
        field: "event_type",
        message: "Event type is required",
        severity: "error",
      });
    }
  }

  return errors;
};

const validateAgentNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  if (!data.agent_type) {
    errors.push({
      nodeId: node.id,
      field: "agent_type",
      message: "Agent type is required",
      severity: "error",
    });
  }

  if (data.agent_type === "custom" && !data.agent_id) {
    errors.push({
      nodeId: node.id,
      field: "agent_id",
      message: "Custom agent selection is required",
      severity: "error",
    });
  }

  return errors;
};

const validateBranchNode = (node: Node): ValidationError[] => {
  const errors: ValidationError[] = [];
  const data = node.data as Record<string, unknown>;

  const branches = data.branches as Array<{ id: string; label: string }> | undefined;

  if (!branches || branches.length < 2) {
    errors.push({
      nodeId: node.id,
      field: "branches",
      message: "At least 2 branches are required",
      severity: "error",
    });
  }

  return errors;
};

const validateNode = (node: Node): ValidationError[] => {
  switch (node.type) {
    case "trigger":
      return validateTriggerNode(node);
    case "action":
      return validateActionNode(node);
    case "condition":
      return validateConditionNode(node);
    case "wait":
      return validateWaitNode(node);
    case "agent":
      return validateAgentNode(node);
    case "branch":
      return validateBranchNode(node);
    default:
      return [];
  }
};

const validateWorkflowStructure = (nodes: Node[], edges: Edge[]): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Must have at least one trigger
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) {
    errors.push({
      nodeId: "",
      message: "Workflow must have at least one trigger",
      severity: "error",
    });
  }

  // Check for disconnected nodes (except triggers which are entry points)
  const connectedNodes = new Set<string>();
  edges.forEach((edge) => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });

  nodes.forEach((node) => {
    if (node.type !== "trigger" && !connectedNodes.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: "Node is not connected to the workflow",
        severity: "warning",
      });
    }
  });

  // Check for cycles (basic check - nodes can't be their own ancestor)
  const adjacencyList = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, []);
    }
    adjacencyList.get(edge.source)!.push(edge.target);
  });

  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {
        errors.push({
          nodeId: "",
          message: "Workflow contains a cycle which may cause infinite loops",
          severity: "error",
        });
        break;
      }
    }
  }

  return errors;
};

export function useWorkflowValidation(nodes: Node[], edges: Edge[]) {
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
    warnings: [],
  });

  const validate = useCallback(() => {
    const allErrors: ValidationError[] = [];

    // Validate individual nodes
    nodes.forEach((node) => {
      const nodeErrors = validateNode(node);
      allErrors.push(...nodeErrors);
    });

    // Validate workflow structure
    const structureErrors = validateWorkflowStructure(nodes, edges);
    allErrors.push(...structureErrors);

    // Separate errors and warnings
    const errors = allErrors.filter((e) => e.severity === "error");
    const warnings = allErrors.filter((e) => e.severity === "warning");

    setValidationResult({
      isValid: errors.length === 0,
      errors,
      warnings,
    });

    return { isValid: errors.length === 0, errors, warnings };
  }, [nodes, edges]);

  // Auto-validate when nodes or edges change
  useEffect(() => {
    validate();
  }, [validate]);

  const getNodeErrors = useCallback(
    (nodeId: string): ValidationError[] => {
      return validationResult.errors.filter((e) => e.nodeId === nodeId);
    },
    [validationResult.errors]
  );

  const getNodeWarnings = useCallback(
    (nodeId: string): ValidationError[] => {
      return validationResult.warnings.filter((e) => e.nodeId === nodeId);
    },
    [validationResult.warnings]
  );

  const hasNodeErrors = useCallback(
    (nodeId: string): boolean => {
      return validationResult.errors.some((e) => e.nodeId === nodeId);
    },
    [validationResult.errors]
  );

  return {
    validationResult,
    validate,
    getNodeErrors,
    getNodeWarnings,
    hasNodeErrors,
  };
}
