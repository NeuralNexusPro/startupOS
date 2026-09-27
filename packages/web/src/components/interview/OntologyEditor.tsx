import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, X, Plus, Edit2, Trash2, Check, XCircle } from "lucide-react";
import type { OntologyModel, OntologyNode } from "@originos/core/types";

interface OntologyEditorProps {
  ontology: OntologyModel;
  onSave: (updatedOntology: OntologyModel) => void;
  onCancel: () => void;
}

interface EditingNode extends OntologyNode {
  isEditing?: boolean;
  isExpanded?: boolean;
}

function OntologyNodeEditor({
  node,
  level = 0,
  onUpdate,
  onDelete,
  onAddChild,
}: {
  node: EditingNode;
  level?: number;
  onUpdate: (nodeId: string, updates: Partial<OntologyNode>) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: node.name,
    description: node.description || "",
    type: node.type,
  });

  const typeLabels: Record<OntologyNode["type"], string> = {
    entity: "实体",
    class: "类",
    property: "属性",
    relationship: "关系",
    rule: "规则",
  };

  const handleSave = () => {
    onUpdate(node.id, editValues);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValues({ name: node.name, description: node.description || "", type: node.type });
    setIsEditing(false);
  };

  const nodeTypes = ["entity", "class", "property", "relationship"] as const;

  if (isEditing) {
    return (
      <div className="space-y-2" style={{ marginLeft: `${level * 24}px` }}>
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">名称</label>
            <Textarea
              value={editValues.name}
              onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
              rows={1}
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">类型</label>
            <select
              value={editValues.type}
              onChange={(e) =>
                setEditValues({ ...editValues, type: e.target.value as OntologyNode["type"] })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {nodeTypes.map((type) => (
                <option key={type} value={type} className="bg-background text-foreground">
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">描述（可选）</label>
            <Textarea
              value={editValues.description}
              onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm">
              <Check className="mr-2 w-3 h-3" />
              保存
            </Button>
            <Button onClick={handleCancel} variant="outline" size="sm">
              <XCircle className="mr-2 w-3 h-3" />
              取消
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ marginLeft: `${level * 24}px` }}>
      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{node.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {typeLabels[node.type]}
            </span>
          </div>
          {node.description && (
            <p className="text-sm text-muted-foreground mt-1">{node.description}</p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
            title="编辑节点"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAddChild(node.id)}
            className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
            title="添加子节点"
          >
            <Plus className="w-4 h-4" />
          </button>
          {level > 0 && (
            <button
              onClick={() => onDelete(node.id)}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="删除节点"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {node.children?.map((child) => (
        <OntologyNodeEditor
          key={child.id}
          node={child as EditingNode}
          level={level + 1}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
}

export function OntologyEditor({ ontology, onSave, onCancel }: OntologyEditorProps) {
  const [editedOntology, setEditedOntology] = useState<OntologyModel>({ ...ontology });
  const [_editingNodeId, _setEditingNodeId] = useState<string | null>(null);

  const handleUpdateNode = (nodeId: string, updates: Partial<OntologyNode>) => {
    const updateNodeRecursive = (nodes: OntologyNode[]): OntologyNode[] => {
      return nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, ...updates };
        }
        if (node.children) {
          return { ...node, children: updateNodeRecursive(node.children) };
        }
        return node;
      });
    };

    setEditedOntology({
      ...editedOntology,
      nodes: updateNodeRecursive(editedOntology.nodes),
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    const deleteNodeRecursive = (nodes: OntologyNode[]): OntologyNode[] => {
      return nodes.filter((node) => {
        if (node.id === nodeId) {
          return false;
        }
        if (node.children) {
          node.children = deleteNodeRecursive(node.children);
        }
        return true;
      });
    };

    setEditedOntology({
      ...editedOntology,
      nodes: deleteNodeRecursive(editedOntology.nodes),
    });
  };

  const handleAddChildNode = (parentId: string) => {
    const newNodeId = `node-${Date.now()}`;
    const newNode: OntologyNode = {
      id: newNodeId,
      name: "新节点",
      type: "class",
      description: "",
    };

    const addNodeRecursive = (nodes: OntologyNode[]): OntologyNode[] => {
      return nodes.map((node) => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newNode],
          };
        }
        if (node.children) {
          return { ...node, children: addNodeRecursive(node.children) };
        }
        return node;
      });
    };

    setEditedOntology({
      ...editedOntology,
      nodes: addNodeRecursive(editedOntology.nodes),
    });
  };

  const handleAddTopLevelNode = () => {
    const newNode: OntologyNode = {
      id: `node-${Date.now()}`,
      name: "新节点",
      type: "entity",
      description: "",
    };

    setEditedOntology({
      ...editedOntology,
      nodes: [...editedOntology.nodes, newNode],
    });
  };

  const handleOntologyNameChange = (name: string) => {
    setEditedOntology({ ...editedOntology, name });
  };

  const handleOntologyDescChange = (description: string) => {
    setEditedOntology({ ...editedOntology, description });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <CardHeader className="space-y-4 pb-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl text-foreground">编辑本体模型</CardTitle>
            <div className="flex gap-2">
              <Button onClick={onCancel} variant="outline" size="sm" className="h-10 border-border text-muted-foreground hover:border-primary hover:text-foreground">
                <X className="mr-2 w-4 h-4" />
                取消
              </Button>
              <Button onClick={() => onSave(editedOntology)} size="sm" className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg shadow-primary/25">
                <Save className="mr-2 w-4 h-4" />
                保存更改
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">本体名称</label>
              <Textarea
                value={editedOntology.name}
                onChange={(e) => handleOntologyNameChange(e.target.value)}
                rows={1}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">描述</label>
              <Textarea
                value={editedOntology.description}
                onChange={(e) => handleOntologyDescChange(e.target.value)}
                rows={1}
                className="resize-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                结构 ({editedOntology.nodes.length} 顶级项)
              </h4>
              <Button
                onClick={handleAddTopLevelNode}
                variant="outline"
                size="sm"
                className="h-10 border-border text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Plus className="mr-2 w-4 h-4" />
                添加节点
              </Button>
            </div>
            <div className="space-y-2 p-4 rounded-lg border bg-card">
              {editedOntology.nodes.map((node) => (
                <OntologyNodeEditor
                  key={node.id}
                  node={node as EditingNode}
                  onUpdate={handleUpdateNode}
                  onDelete={handleDeleteNode}
                  onAddChild={handleAddChildNode}
                />
              ))}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              <strong>提示：</strong>点击节点的编辑图标可以修改它，使用 + 图标可以添加
              子节点，或者使用垃圾桶图标删除节点（非根节点）。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
