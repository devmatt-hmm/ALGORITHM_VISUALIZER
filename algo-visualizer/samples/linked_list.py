# Press Ctrl+Alt+D (or right-click -> "Visualize My Linked List / Stack / Queue Code")
# The whole file runs once; every change to a linked structure becomes a step.

class Node:
    def __init__(self, data):
        self.data = data
        self.next = None


class LinkedList:
    def __init__(self):
        self.head = None

    def append(self, data):
        new = Node(data)
        if self.head is None:
            self.head = new
            return
        cur = self.head
        while cur.next:
            cur = cur.next
        cur.next = new

    def reverse(self):
        prev = None
        cur = self.head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        self.head = prev


if __name__ == "__main__":
    ll = LinkedList()
    for v in (10, 20, 30):
        ll.append(v)
    ll.reverse()
