using Kanban.Entities;
using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    [Authorize]
    public class KanbanController : Controller
    {
        private readonly IKanbanService _kanbanService;
        public KanbanController(IKanbanService kanbanService)
        {
            _kanbanService = kanbanService;
        }

        [HttpGet]
        public async Task<IActionResult> GetBoard(long boardId)
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoard(userId, boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardColumnResultModel>>.Ok(r.Data));
        }

        [HttpGet]
        public async Task<IActionResult> GetBoardMembers(long boardId)
        {
            var r = await _kanbanService.GetBoardMembers(User.GetUserId(), boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardMemberResultModel>>.Ok(r.Data));
        }

        [HttpPost]
        public async Task<IActionResult> UpdateCard([FromBody] BoardCardUpdateModel model)
        {
            var r = await _kanbanService.UpdateCard(User.GetUserId(), model.BoardId, model.CardId, model.Description,
                model.DueDate, model.WarningDays, model.HighlightColor, model.AssigneeId);

            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteMember([FromBody] BoardMemberInputModel model)
        {
            var r = await _kanbanService.DeleteMember(User.GetUserId(), model.BoardId, model.UserId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> PromoteToOwner([FromBody] BoardMemberInputModel model)
        {
            var r = await _kanbanService.PromoteToOwner(User.GetUserId(), model.BoardId, model.UserId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpGet]
        public async Task<IActionResult> CheckBoardVersion(long boardId)
        {
            var r = await _kanbanService.GetBoardVersion(User.GetUserId(), boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<BoardRefresResultModel>.Ok(r.Data));
        }

        [HttpGet]
        public async Task<IActionResult> GetBoards()
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoards(userId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardResultModel>>.Ok(r.Data.Select(x => new BoardResultModel
            {
                Id = x.Board.Id,
                Title = x.Board.Title,
                IsOwner = x.IsOwner
            }).OrderByDescending(x => x.Id).ToList()));
        }

        [HttpPost]
        public async Task<IActionResult> CreateBoard([FromBody] BoardInputModel model)
        {
            var r = await _kanbanService.CreateBoard(User.GetUserId(), model.Title);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteBoard([FromBody] BoardDeleteModel model)
        {
            var r = await _kanbanService.DeleteBoard(User.GetUserId(), model.BoardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> AddColumn([FromBody] BoardColumnInputModel model)
        {
            var r = await _kanbanService.AddColumn(User.GetUserId(), model.BoardId, model.Title);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteColumn([FromBody] BoardColumnDeleteModel model)
        {
            var r = await _kanbanService.DeleteColumn(User.GetUserId(), model.BoardId, model.ColumnId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> AddCard([FromBody] BoardCardInsertModel model)
        {
            var r = await _kanbanService.AddCard(User.GetUserId(), model.BoardId, model.ColumnId, model.Description,
                model.DueDate, model.WarningDays, model.HighlightColor, model.AssigneeId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteCard([FromBody] BoardCardDeleteModel model)
        {
            var r = await _kanbanService.DeleteCard(User.GetUserId(), model.BoardId, model.CardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> MoveCard([FromBody] BoardCardMoveInputModel model)
        {
            var r = await _kanbanService.MoveCard(User.GetUserId(), model.BoardId, model.CardId, model.NewColumnId, model.NewOrder);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> InviteUserToBoard([FromBody] BoardUserInputModel model)
        {
            var r = await _kanbanService.InviteUserToBoard(User.GetUserId(), User.GetFullName(), User.GetEmail(), model.BoardId, model.Email);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpGet]
        public async Task<IActionResult> GetInvites()
        {
            var r = await _kanbanService.GetInvites(User.GetEmail());
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<InviteResultModel>>.Ok(r.Data));
        }

        [HttpGet]
        public async Task<IActionResult> GetNotifications()
        {
            var r = await _kanbanService.GetNotifications(User.GetUserId());
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<NotificationResultModel>>.Ok(r.Data));
        }

        [HttpPost]
        public async Task<IActionResult> WorkInvite([FromBody] InviteInputModel model)
        {
            var r = await _kanbanService.WorkInvite(User.GetEmail(), User.GetUserId(), model.InviteId, model.IsAccepted);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteNotification([FromBody] NotificationInputModel model)
        {
            var r = await _kanbanService.DeleteNotification(User.GetUserId(), model.NotificationId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteNotifications()
        {
            var r = await _kanbanService.DeleteNotifications(User.GetUserId());
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpGet]
        public async Task<IActionResult> CheckUpdates()
        {
            var r = await _kanbanService.CheckUpdates(User.GetUserId(), User.GetEmail());
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<bool>.Ok(r.Data));
        }

        [HttpGet]
        public async Task<IActionResult> GetComments(long boardId, long cardId)
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetComments(userId, boardId, cardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<CommentResutModel>>.Ok(r.Data));
        }

        [HttpPost]
        public async Task<IActionResult> AddComment([FromBody] CommentInputModel model)
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.AddComment(userId, model.BoardId, model.CardId, model.Message);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteComment([FromBody] BoardCardCommentDeleteModel model)
        {
            var r = await _kanbanService.DeleteComment(User.GetUserId(), model.BoardId, model.CommentId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }
    }
}
