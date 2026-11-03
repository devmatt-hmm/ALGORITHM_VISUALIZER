from collections import deque

stack = []
for x in (1, 2, 3):
    stack.append(x)
stack.pop()

queue = deque()
queue.append("a")
queue.append("b")
queue.popleft()
