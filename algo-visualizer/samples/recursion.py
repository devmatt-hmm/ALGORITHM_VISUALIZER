# Put the cursor inside a recursive function and press Ctrl+Alt+R
# (or right-click -> "Visualize My Recursive Python Function").
# You type the arguments, for example:   5     or     [3, 1, 4, 1, 5], 0

def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)


def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


def sum_list(nums):
    if not nums:
        return 0
    return nums[0] + sum_list(nums[1:])


def hanoi(n, src, dst, via):
    if n == 1:
        return 1
    return hanoi(n - 1, src, via, dst) + 1 + hanoi(n - 1, via, dst, src)


def countdown(n):          # a bug on purpose: try countdown(3), then look at the red calls
    if n == 0:
        return "liftoff"
    return countdown(n - 2)


if __name__ == "__main__":
    print(fact(5))
