# Put the cursor in a graph function and press Ctrl+Alt+G (or right-click ->
# "Visualize My Graph Function"). You choose a graph and a start node.
# The graph arrives as a dict: graph["A"] is the list of A's neighbours
# (or {neighbour: weight} / [(neighbour, weight)] when the edges have weights).
from collections import deque
import heapq


def bfs(graph, start):
    visited = {start}
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in graph[node]:
            if nxt not in visited:
                visited.add(nxt)
                queue.append(nxt)
    return order


def dfs(graph, node, visited=None):
    if visited is None:
        visited = set()
    visited.add(node)
    for nxt in graph[node]:
        if nxt not in visited:
            dfs(graph, nxt, visited)
    return visited


def dijkstra(graph, start):
    dist = {n: float("inf") for n in graph}
    dist[start] = 0
    heap = [(0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in graph[u].items():
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(heap, (dist[v], v))
    return dist
