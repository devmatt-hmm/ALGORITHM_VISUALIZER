# Press Ctrl+Alt+T (or right-click -> "Visualize My Tree Code").
# The whole file runs once; every change to the tree is a step.

class Node:
    def __init__(self, data):
        self.data = data
        self.left = None
        self.right = None


def insert(root, v):
    if root is None:
        return Node(v)
    if v < root.data:
        root.left = insert(root.left, v)
    elif v > root.data:
        root.right = insert(root.right, v)
    return root


def inorder(root, out):
    if root is None:
        return
    inorder(root.left, out)
    out.append(root.data)
    inorder(root.right, out)


if __name__ == "__main__":
    root = None
    for v in (50, 30, 70, 20, 40):
        root = insert(root, v)
    result = []
    inorder(root, result)
    print(result)
